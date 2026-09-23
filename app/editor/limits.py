from __future__ import annotations

from app.errors import AppError

import html
import re
from collections.abc import Iterable
from typing import Any

MAX_PAGE_BLOCKS = 30
MAX_VISIBLE_CHARACTERS = 25_000
MAX_TABLE_COLUMNS = 25
MAX_TABLE_ROWS = 50
MAX_SAVED_PAGES = 12
EDITOR_SESSION_TTL_SECONDS = 2 * 60 * 60

_HTML_TAG_RE = re.compile(r"<[^>]+>")


class EditorLimitError(AppError, ValueError):
    def __init__(self, code: str, limit: int, actual: int) -> None:
        self.code = code
        self.limit = limit
        self.actual = actual
        super().__init__(f"{code}: {actual} > {limit}")


def _plain_html(value: Any) -> str:
    if not isinstance(value, str) or not value:
        return ""
    return html.unescape(_HTML_TAG_RE.sub("", value))


def _plain_rich_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(_plain_rich_text(item) for item in value)
    if isinstance(value, dict):
        if value.get("type") == "custom_emoji":
            return str(value.get("alternative_text") or "")
        return _plain_rich_text(
            value.get("text", value.get("children", value.get("alternative_text", "")))
        )
    return str(value)


def _block_children(block: dict[str, Any]) -> Iterable[dict[str, Any]]:
    data = block.get("data")
    if not isinstance(data, dict):
        return
    for key in ("children", "media_children"):
        children = data.get(key)
        if isinstance(children, list):
            for child in children:
                if isinstance(child, dict):
                    yield child
    items = data.get("items")
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            children = item.get("blocks")
            if isinstance(children, list):
                for child in children:
                    if isinstance(child, dict):
                        yield child


def _quota_children(block: dict[str, Any]) -> Iterable[dict[str, Any]]:
    """Nested editor blocks that consume the 30-block editor quota.

    Media inside collage/slideshow/quotes keep their dedicated media limits and
    do not consume extra editor-block slots.
    """
    data = block.get("data")
    if not isinstance(data, dict):
        return
    if str(block.get("type") or "") == "details":
        children = data.get("children")
        if isinstance(children, list):
            for child in children:
                if isinstance(child, dict):
                    yield child
    items = data.get("items")
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            children = item.get("blocks")
            if isinstance(children, list):
                for child in children:
                    if isinstance(child, dict):
                        yield child


def iter_editor_blocks(blocks: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
    for block in blocks:
        if not isinstance(block, dict):
            continue
        yield block
        yield from iter_editor_blocks(_quota_children(block))


def block_count(blocks: list[dict[str, Any]]) -> int:
    return sum(1 for _ in iter_editor_blocks(blocks))


def _table_rows(block: dict[str, Any]) -> list[list[Any]]:
    data = block.get("data")
    if not isinstance(data, dict):
        return []
    rows = data.get("rows")
    if isinstance(rows, list):
        return [row for row in rows if isinstance(row, list)]
    native = data.get("native_data")
    if isinstance(native, dict):
        cells = native.get("cells")
        if isinstance(cells, list):
            return [row for row in cells if isinstance(row, list)]
    return []


def _row_width(row: list[Any]) -> int:
    width = 0
    for raw in row:
        if isinstance(raw, dict):
            try:
                width += max(1, int(raw.get("colspan") or 1))
            except (TypeError, ValueError):
                width += 1
        else:
            width += 1
    return width


def validate_table_rows(rows: list[list[Any]]) -> None:
    row_count = len(rows)
    if row_count > MAX_TABLE_ROWS:
        raise EditorLimitError("table_rows", MAX_TABLE_ROWS, row_count)
    widest = max((_row_width(row) for row in rows), default=0)
    if widest > MAX_TABLE_COLUMNS:
        raise EditorLimitError("table_columns", MAX_TABLE_COLUMNS, widest)


def _native_visible_text(value: Any, key: str | None = None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        if key in {
            "text",
            "summary",
            "caption",
            "credit",
            "expression",
            "alternative_text",
            "name",
        }:
            return value
        return ""
    if isinstance(value, list):
        return "".join(_native_visible_text(item, key) for item in value)
    if not isinstance(value, dict):
        return ""
    return "".join(_native_visible_text(item, child_key) for child_key, item in value.items())


def _cell_text(raw: Any) -> str:
    if isinstance(raw, dict):
        rich = raw.get("rich_text")
        if rich not in (None, "", []):
            return _plain_rich_text(rich)
        if raw.get("text") not in (None, ""):
            return _plain_rich_text(raw.get("text"))
        return _plain_html(raw.get("html"))
    return "" if raw is None else str(raw)


def _generated_visible_text(block: dict[str, Any]) -> str:
    kind = str(block.get("type") or "")
    data = block.get("data")
    if not isinstance(data, dict):
        return ""

    native = data.get("native_data")
    if data.get("native") and isinstance(native, dict):
        return _native_visible_text(native)

    if kind == "list":
        items = data.get("items")
        if not isinstance(items, list):
            return ""
        text_parts: list[str] = []
        for item in items:
            if isinstance(item, dict):
                if isinstance(item.get("blocks"), list):
                    text_parts.append(
                        visible_character_text(
                            [child for child in item["blocks"] if isinstance(child, dict)]
                        )
                    )
                else:
                    text_parts.append(
                        _plain_rich_text(item.get("rich_text"))
                        or _plain_rich_text(item.get("text"))
                        or _plain_html(item.get("html"))
                    )
            else:
                text_parts.append(str(item))
        return "".join(text_parts)

    if kind == "table":
        return "".join(_cell_text(cell) for row in _table_rows(block) for cell in row)

    if kind == "details":
        summary = (
            _plain_rich_text(data.get("summary_rich_text"))
            or _plain_rich_text(data.get("summary_text"))
            or _plain_html(data.get("summary_html"))
        )
        return summary + visible_character_text(list(_block_children(block)))

    if kind in {"collage", "slideshow"}:
        caption = (
            _plain_rich_text(data.get("caption_rich_text"))
            or _plain_rich_text(data.get("caption_text"))
            or _plain_html(data.get("caption_html"))
        )
        return caption + visible_character_text(list(_block_children(block)))

    if kind in {"blockquote", "pullquote"}:
        quote = (
            _plain_rich_text(data.get("quote_rich_text"))
            or _plain_rich_text(data.get("quote_text"))
            or _plain_html(data.get("quote_html"))
            or _plain_html(data.get("html"))
        )
        credit = (
            _plain_rich_text(data.get("credit_rich_text"))
            or _plain_rich_text(data.get("credit_text"))
            or _plain_html(data.get("credit_html"))
        )
        return quote + credit + visible_character_text(list(_block_children(block)))

    caption = (
        _plain_rich_text(data.get("caption_rich_text"))
        or _plain_rich_text(data.get("caption_text"))
        or _plain_html(data.get("caption_html"))
    )
    credit = (
        _plain_rich_text(data.get("credit_rich_text"))
        or _plain_rich_text(data.get("credit_text"))
        or _plain_html(data.get("credit_html"))
    )
    text = (
        _plain_rich_text(data.get("rich_text"))
        or _plain_rich_text(data.get("text"))
        or _plain_html(data.get("html"))
    )
    return text + caption + credit


def visible_character_text(blocks: list[dict[str, Any]]) -> str:
    return "".join(_generated_visible_text(block) for block in blocks if isinstance(block, dict))


def visible_character_count(blocks: list[dict[str, Any]]) -> int:
    return len(visible_character_text(blocks))


def validate_editor_limits(blocks: list[dict[str, Any]]) -> None:
    actual_blocks = block_count(blocks)
    if actual_blocks > MAX_PAGE_BLOCKS:
        raise EditorLimitError("blocks", MAX_PAGE_BLOCKS, actual_blocks)

    characters = visible_character_count(blocks)
    if characters > MAX_VISIBLE_CHARACTERS:
        raise EditorLimitError("characters", MAX_VISIBLE_CHARACTERS, characters)

    for block in iter_editor_blocks(blocks):
        if str(block.get("type") or "") == "table":
            validate_table_rows(_table_rows(block))


__all__ = [
    "EDITOR_SESSION_TTL_SECONDS",
    "EditorLimitError",
    "MAX_PAGE_BLOCKS",
    "MAX_SAVED_PAGES",
    "MAX_TABLE_COLUMNS",
    "MAX_TABLE_ROWS",
    "MAX_VISIBLE_CHARACTERS",
    "block_count",
    "iter_editor_blocks",
    "validate_editor_limits",
    "validate_table_rows",
    "visible_character_count",
]

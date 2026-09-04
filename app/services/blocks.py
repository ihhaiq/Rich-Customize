from __future__ import annotations

import copy
from collections.abc import Iterator, Mapping
from typing import Any, TypeVar, overload

from app.editor.document import (
    add_block,
    add_child,
    child_blocks,
    delete_block,
    delete_child,
    duplicate_block,
    get_block_by_id,
    move_block,
    move_child,
    normalize_block_positions,
    replace_block,
    replace_block_data,
    replace_child,
)
from app.i18n import t
from app.editor.types import Block, BlockData, BlockList

_T = TypeVar("_T")

BLOCK_LABEL_KEYS: dict[str, str] = {
    "text": "block.text",
    "paragraph": "block.paragraph",
    "heading": "block.heading",
    "preformatted": "block.preformatted",
    "footer": "block.footer",
    "caption": "block.caption",
    "photo": "block.photo",
    "video": "block.video",
    "animation": "block.animation",
    "audio": "block.audio",
    "voice": "block.voice",
    "document": "block.document",
    "sticker": "block.sticker",
    "video_note": "block.video_note",
    "divider": "block.divider",
    "list": "block.list",
    "table": "block.table",
    "blockquote": "block.blockquote",
    "pullquote": "block.pullquote",
    "details": "block.details",
    "mathematical_expression": "block.mathematical_expression",
    "anchor": "block.anchor",
    "collage": "block.collage",
    "slideshow": "block.slideshow",
    "map": "block.map",
    "buttons": "block.buttons",
}


class _LocalizedBlockLabels(Mapping[str, str]):
    def __getitem__(self, block_type: str) -> str:
        return t(BLOCK_LABEL_KEYS[block_type])

    def __iter__(self) -> Iterator[str]:
        return iter(BLOCK_LABEL_KEYS)

    def __len__(self) -> int:
        return len(BLOCK_LABEL_KEYS)

    @overload
    def get(self, block_type: str) -> str | None: ...

    @overload
    def get(self, block_type: str, default: str) -> str: ...

    @overload
    def get(self, block_type: str, default: _T) -> str | _T: ...

    def get(self, block_type: str, default: _T | None = None) -> str | _T | None:
        key = BLOCK_LABEL_KEYS.get(block_type)
        return t(key) if key else default


BLOCK_LABELS: Mapping[str, str] = _LocalizedBlockLabels()


def get_block_label(block_type: str) -> str:
    key = BLOCK_LABEL_KEYS.get(block_type)
    return t(key) if key else t("block.content")


def update_block(blocks: BlockList, block_id: str, data: BlockData) -> bool:
    return replace_block_data(blocks, block_id, data) is not None


def _rich_text_plain(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(_rich_text_plain(item) for item in value)
    if isinstance(value, dict):
        if value.get("type") == "custom_emoji":
            return str(value.get("alternative_text") or "")
        return _rich_text_plain(value.get("text", value.get("children", "")))
    return str(value)


def _editable_table_rows(rows: list[list[Any]]) -> list[list[Any]]:
    editable = copy.deepcopy(rows)
    for row in editable:
        if not isinstance(row, list):
            continue
        for index, raw in enumerate(row):
            if not isinstance(raw, dict):
                continue
            rich_text = raw.get("text")
            if isinstance(rich_text, (dict, list)):
                raw["rich_text"] = copy.deepcopy(rich_text)
                raw["text"] = _rich_text_plain(rich_text)
            row[index] = raw
    return editable


def table_rows(block: Block) -> list[list[Any]]:
    """Return table cells from either an editor-created or received native table."""
    if block.get("type") != "table":
        return []
    data = block.get("data", {})
    rows = data.get("rows")
    if isinstance(rows, list):
        return rows
    native = data.get("native_data")
    if isinstance(native, dict) and isinstance(native.get("cells"), list):
        return native["cells"]
    return []


def editable_table_data(block: Block) -> BlockData | None:
    """Detach a received table from its native payload before changing it."""
    if block.get("type") != "table":
        return None
    old = block.setdefault("data", {})
    rows = _editable_table_rows(table_rows(block))
    if not rows:
        return None
    native = old.get("native_data") if isinstance(old.get("native_data"), dict) else {}
    data = {
        **{
            key: value
            for key, value in old.items()
            if key not in {"native", "native_data", "native_type", "html", "rows"}
        },
        "rows": rows,
        "is_bordered": old.get("is_bordered", native.get("is_bordered", True)),
        "is_striped": old.get("is_striped", native.get("is_striped")),
        "is_compact": old.get("is_compact", native.get("is_compact")),
        "caption_rich_text": old.get("caption_rich_text", native.get("caption")),
    }
    block["source"] = "generated"
    block["data"] = data
    return data


def table_flag(block: Block, field: str) -> bool:
    """Read a table display flag from generated or received native data."""
    data = block.get("data", {})
    native = data.get("native_data") if isinstance(data.get("native_data"), dict) else {}
    default = True if field == "is_bordered" else False
    return bool(data.get(field, native.get(field, default)))


def set_table_cell_style(
    block: Block,
    row_index: int,
    column_index: int,
    *,
    shaded: bool | None = None,
    centered: bool | None = None,
) -> bool:
    data = editable_table_data(block)
    if data is None:
        return False
    rows = data["rows"]
    if not 0 <= row_index < len(rows) or not 0 <= column_index < len(rows[row_index]):
        return False
    raw = rows[row_index][column_index]
    cell = copy.deepcopy(raw) if isinstance(raw, dict) else {"text": str(raw)}
    if shaded is not None:
        cell["is_header"] = shaded
    if centered is not None:
        if centered:
            if cell.get("align") != "center":
                cell["_previous_align"] = cell.get("align") or "left"
            cell["align"] = "center"
        else:
            cell["align"] = cell.pop("_previous_align", "left")
    cell.setdefault("valign", "middle")
    rows[row_index][column_index] = cell
    return True


def set_all_table_cells_style(
    block: Block,
    *,
    shaded: bool | None = None,
    centered: bool | None = None,
) -> bool:
    data = editable_table_data(block)
    if data is None:
        return False
    changed = False
    for row_index, row in enumerate(data["rows"]):
        for column_index in range(len(row)):
            changed = set_table_cell_style(
                block,
                row_index,
                column_index,
                shaded=shaded,
                centered=centered,
            ) or changed
    return changed


def get_block_button_text(block: Block, index: int) -> str:
    return f"{get_block_label(str(block.get('type', '')))} #{index + 1}"


__all__ = [
    "BLOCK_LABELS",
    "BLOCK_LABEL_KEYS",
    "add_block",
    "add_child",
    "child_blocks",
    "delete_block",
    "delete_child",
    "duplicate_block",
    "editable_table_data",
    "get_block_button_text",
    "get_block_by_id",
    "get_block_label",
    "move_block",
    "move_child",
    "normalize_block_positions",
    "replace_block",
    "replace_block_data",
    "replace_child",
    "set_all_table_cells_style",
    "set_table_cell_style",
    "table_flag",
    "table_rows",
    "update_block",
]

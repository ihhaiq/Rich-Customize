from __future__ import annotations

import copy
from collections.abc import Iterator, Mapping
from typing import Any

from app.i18n import t


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
    """Backward-compatible mapping whose values follow the active locale.

    Existing callers can keep using ``BLOCK_LABELS.get(...)`` while all label
    data is now keyed centrally. This removes the old static Arabic dictionary
    without forcing every router to change in the same commit.
    """

    def __getitem__(self, block_type: str) -> str:
        return t(BLOCK_LABEL_KEYS[block_type])

    def __iter__(self) -> Iterator[str]:
        return iter(BLOCK_LABEL_KEYS)

    def __len__(self) -> int:
        return len(BLOCK_LABEL_KEYS)

    def get(self, block_type: str, default: str | None = None) -> str | None:
        key = BLOCK_LABEL_KEYS.get(block_type)
        return t(key) if key else default


BLOCK_LABELS: Mapping[str, str] = _LocalizedBlockLabels()


def get_block_label(block_type: str) -> str:
    key = BLOCK_LABEL_KEYS.get(block_type)
    return t(key) if key else t("block.content")


def normalize_block_positions(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    blocks.sort(key=lambda item: int(item.get("position", 0)))
    for position, block in enumerate(blocks):
        block["position"] = position
    return blocks


def _reindex_current_order(blocks: list[dict[str, Any]]) -> None:
    for position, block in enumerate(blocks):
        block["position"] = position


def get_block_by_id(blocks: list[dict[str, Any]], block_id: str) -> dict[str, Any] | None:
    return next((block for block in blocks if block.get("id") == block_id), None)


def delete_block(blocks: list[dict[str, Any]], block_id: str) -> bool:
    block = get_block_by_id(blocks, block_id)
    if block is None:
        return False
    blocks.remove(block)
    normalize_block_positions(blocks)
    return True


def move_block(blocks: list[dict[str, Any]], block_id: str, new_index: int) -> bool:
    normalize_block_positions(blocks)
    block = get_block_by_id(blocks, block_id)
    if block is None or not 0 <= new_index < len(blocks):
        return False
    old_index = blocks.index(block)
    if old_index == new_index:
        return True
    blocks.insert(new_index, blocks.pop(old_index))
    _reindex_current_order(blocks)
    return True


def update_block(blocks: list[dict[str, Any]], block_id: str, data: dict[str, Any]) -> bool:
    block = get_block_by_id(blocks, block_id)
    if block is None:
        return False
    block["data"] = data
    return True


def table_rows(block: dict[str, Any]) -> list[list[Any]]:
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


def _editable_table_data(block: dict[str, Any]) -> dict[str, Any] | None:
    """Detach a received table from its native payload before changing a cell."""
    if block.get("type") != "table":
        return None
    old = block.setdefault("data", {})
    rows = copy.deepcopy(table_rows(block))
    if not rows:
        return None
    native = old.get("native_data") if isinstance(old.get("native_data"), dict) else {}
    data = {
        **{key: value for key, value in old.items() if key not in {"native", "native_data", "html", "rows"}},
        "rows": rows,
        "is_bordered": old.get("is_bordered", native.get("is_bordered", True)),
        "is_striped": old.get("is_striped", native.get("is_striped")),
        "caption_rich_text": old.get("caption_rich_text", native.get("caption")),
        "native": False,
    }
    block["data"] = data
    return data


def set_table_cell_style(
    block: dict[str, Any], row_index: int, column_index: int,
    *, shaded: bool | None = None, centered: bool | None = None,
) -> bool:
    data = _editable_table_data(block)
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
    block: dict[str, Any], *, shaded: bool | None = None, centered: bool | None = None,
) -> bool:
    data = _editable_table_data(block)
    if data is None:
        return False
    changed = False
    for row_index, row in enumerate(data["rows"]):
        for column_index in range(len(row)):
            changed = set_table_cell_style(
                block, row_index, column_index, shaded=shaded, centered=centered,
            ) or changed
    return changed


def get_block_button_text(block: dict[str, Any], index: int) -> str:
    return f"{get_block_label(str(block.get('type', '')))} #{index + 1}"

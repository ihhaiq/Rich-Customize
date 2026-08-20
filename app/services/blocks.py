from __future__ import annotations

import copy
from typing import Any


BLOCK_LABELS = {
    "text": "📝 نص",
    "paragraph": "📝 فقرة",
    "heading": "🔠 عنوان قسم",
    "preformatted": "💻 نص برمجي",
    "footer": "🔻 تذييل",
    "caption": "💬 وصف",
    "photo": "🖼 صورة",
    "video": "🎬 فيديو",
    "animation": "🎞 GIF",
    "audio": "🎵 صوت",
    "voice": "🎙 بصمة صوتية",
    "document": "📄 ملف",
    "sticker": "🏷 ملصق",
    "video_note": "⭕ فيديو دائري",
    "divider": "➖ فاصل",
    "list": "📋 قائمة",
    "table": "▦ جدول",
    "blockquote": "❝ اقتباس",
    "pullquote": "💬 اقتباس بارز",
    "details": "📂 تفاصيل",
    "mathematical_expression": "∑ معادلة",
    "anchor": "⚓ مرساة",
    "collage": "🖼 كولاج",
    "slideshow": "🎞 عرض شرائح",
    "map": "🗺 خريطة",
}


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


def _positive_span(value: Any) -> int:
    try:
        return max(1, int(value or 1))
    except (TypeError, ValueError):
        return 1


def merge_table_cell_right(
    block: dict[str, Any], row_index: int, column_index: int,
) -> bool:
    """Merge a table cell with its next physical cell and preserve its data."""
    data = _editable_table_data(block)
    if data is None:
        return False
    rows = data["rows"]
    if not 0 <= row_index < len(rows):
        return False
    row = rows[row_index]
    if not 0 <= column_index < len(row) - 1:
        return False

    raw_cell = row[column_index]
    raw_next = row[column_index + 1]
    cell = copy.deepcopy(raw_cell) if isinstance(raw_cell, dict) else {"text": str(raw_cell)}
    next_cell = copy.deepcopy(raw_next) if isinstance(raw_next, dict) else {"text": str(raw_next)}
    if _positive_span(cell.get("rowspan")) != _positive_span(next_cell.get("rowspan")):
        return False

    current_colspan = _positive_span(cell.get("colspan"))
    if "_original_colspan" not in cell:
        cell["_original_colspan"] = current_colspan
    merged = cell.get("_merged_right")
    if not isinstance(merged, list):
        merged = []
    merged.append(next_cell)
    cell["_merged_right"] = merged
    cell["colspan"] = current_colspan + _positive_span(next_cell.get("colspan"))
    row[column_index] = cell
    row.pop(column_index + 1)
    return True


def merge_table_row_from_cell(
    block: dict[str, Any], row_index: int, column_index: int,
) -> bool:
    """Merge the selected cell with every compatible cell after it in the row."""
    changed = False
    while merge_table_cell_right(block, row_index, column_index):
        changed = True
    return changed


def unmerge_table_cell(
    block: dict[str, Any], row_index: int, column_index: int,
) -> bool:
    """Undo a horizontal merge, restoring saved cells when available."""
    data = _editable_table_data(block)
    if data is None:
        return False
    rows = data["rows"]
    if not 0 <= row_index < len(rows) or not 0 <= column_index < len(rows[row_index]):
        return False
    row = rows[row_index]
    raw = row[column_index]
    cell = copy.deepcopy(raw) if isinstance(raw, dict) else {"text": str(raw)}
    colspan = _positive_span(cell.get("colspan"))
    restored = cell.pop("_merged_right", None)
    original_colspan = _positive_span(cell.pop("_original_colspan", 1))
    if isinstance(restored, list) and restored:
        if original_colspan == 1:
            cell.pop("colspan", None)
        else:
            cell["colspan"] = original_colspan
        row[column_index] = cell
        for offset, restored_cell in enumerate(restored, start=1):
            row.insert(column_index + offset, restored_cell)
        return True
    if colspan <= 1:
        return False

    cell.pop("colspan", None)
    row[column_index] = cell
    for offset in range(1, colspan):
        row.insert(column_index + offset, {"text": "", "valign": "middle"})
    return True


def get_block_button_text(block: dict[str, Any], index: int) -> str:
    return f"{BLOCK_LABELS.get(block.get('type', ''), '📦 محتوى')} #{index + 1}"

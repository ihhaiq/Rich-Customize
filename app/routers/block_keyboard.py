from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.i18n import t
from app.keyboards import build_block_editor_keyboard


def build_managed_block_keyboard(
    block: dict,
    blocks: list[dict],
) -> InlineKeyboardMarkup:
    """Extend the compatibility block keyboard with extracted actions."""
    markup = build_block_editor_keyboard(block, blocks)
    rows = [list(row) for row in markup.inline_keyboard]
    block_id = str(block["id"])
    if block.get("type") != "anchor" and not any(
        getattr(button, "callback_data", None) == f"r:dup:{block_id}"
        for row in rows
        for button in row
    ):
        duplicate_row = [InlineKeyboardButton(
            text=t("block.duplicate_button"),
            callback_data=f"r:dup:{block_id}",
        )]
        delete_index = next(
            (
                index
                for index, row in enumerate(rows)
                if any(
                    str(getattr(button, "callback_data", "") or "").startswith("r:d:")
                    for button in row
                )
            ),
            max(0, len(rows) - 1),
        )
        rows.insert(delete_index, duplicate_row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


__all__ = ["build_managed_block_keyboard"]

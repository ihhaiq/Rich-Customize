from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.editor.view_state import (
    BLOCK_SCROLL_SIZE,
    current_block_scroll_offset,
    normalize_block_scroll_offset,
)
from app.i18n import t, tr
from app.services.blocks import get_block_button_text


def build_welcome_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🧩 قالب كل البلوكات", callback_data="r:showcase"),
        InlineKeyboardButton(
            text=t("editor.new_button"), callback_data="r:starteditor",
            style=ButtonStyle.PRIMARY,
        ),
    ]])


def build_start_editor_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("editor.start_button"),
            callback_data="r:starteditor",
            style=ButtonStyle.PRIMARY,
        ),
    ]])


def build_rich_editor_keyboard(
    blocks: list[dict[str, Any]],
    buttons: list[dict[str, Any]] | None = None,
    *,
    block_offset: int | None = None,
) -> InlineKeyboardMarkup:
    if not blocks:
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text=t("pages"), callback_data="r:pages"),
            InlineKeyboardButton(
                text=t("ux.editor.add_block"), callback_data="r:addmenu",
                style=ButtonStyle.PRIMARY,
            ),
        ]])

    ordered_blocks = sorted(blocks, key=lambda item: item["position"])
    requested_offset = (
        current_block_scroll_offset()
        if block_offset is None
        else block_offset
    )
    normalized_offset = normalize_block_scroll_offset(
        len(ordered_blocks),
        requested_offset,
    )
    visible_blocks = ordered_blocks[
        normalized_offset:normalized_offset + BLOCK_SCROLL_SIZE
    ]

    rows: list[list[InlineKeyboardButton]] = []
    if normalized_offset > 0:
        rows.append([InlineKeyboardButton(
            text=tr("⬆️ صعود"),
            callback_data=f"r:blockscroll:{max(0, normalized_offset - BLOCK_SCROLL_SIZE)}",
        )])

    rows.extend([
        [
            InlineKeyboardButton(
                text=get_block_button_text(block, normalized_offset + index),
                callback_data=f"r:b:{block['id']}",
            ),
            InlineKeyboardButton(
                text="👁",
                callback_data=f"r:peek:{block['id']}",
            ),
        ]
        for index, block in enumerate(visible_blocks)
    ])

    if normalized_offset + BLOCK_SCROLL_SIZE < len(ordered_blocks):
        rows.append([InlineKeyboardButton(
            text=tr("⬇️ تمرير"),
            callback_data=f"r:blockscroll:{normalized_offset + BLOCK_SCROLL_SIZE}",
        )])

    rows.append([
        InlineKeyboardButton(
            text=t("ux.editor.preview"), callback_data="r:result",
            style=ButtonStyle.PRIMARY,
        ),
    ])
    if len(blocks) >= 2:
        rows.append([
            InlineKeyboardButton(text=t("editor.undo_button"), callback_data="r:undo"),
            InlineKeyboardButton(text=t("editor.redo_button"), callback_data="r:redo"),
        ])
    rows.append([InlineKeyboardButton(
        text=t("editor.tools_button"), callback_data="r:tools",
        style=ButtonStyle.PRIMARY,
    )])
    rows.append([
        InlineKeyboardButton(
            text=t("ux.editor.add_block"), callback_data="r:addmenu",
            style=ButtonStyle.PRIMARY,
        ),
        InlineKeyboardButton(
            text=t("ux.editor.publish"), callback_data="r:post",
            style=ButtonStyle.SUCCESS,
        ),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_editor_tools_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=t("pages"), callback_data="r:pages"),
            InlineKeyboardButton(text=t("ux.editor.manage_buttons"), callback_data="r:buttons"),
        ],
        [InlineKeyboardButton(
            text=t("save_page"), callback_data="r:savepage",
            style=ButtonStyle.SUCCESS,
        )],
        [InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:back")],
    ])


def build_result_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="✅ النتيجة", callback_data="r:result", style=ButtonStyle.SUCCESS,
        ),
    ]])


def build_error_recovery_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("ux.common.retry"), callback_data="r:result",
            style=ButtonStyle.PRIMARY,
        ),
        InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:back"),
    ]])


__all__ = [
    "BLOCK_SCROLL_SIZE",
    "build_editor_tools_keyboard",
    "build_error_recovery_keyboard",
    "build_result_keyboard",
    "build_rich_editor_keyboard",
    "build_start_editor_keyboard",
    "build_welcome_keyboard",
]

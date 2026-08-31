from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.i18n import t
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
    blocks: list[dict[str, Any]], buttons: list[dict[str, Any]] | None = None,
) -> InlineKeyboardMarkup:
    del buttons  # retained in the public signature for compatibility
    if not blocks:
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="📚 صفحاتي", callback_data="r:pages"),
            InlineKeyboardButton(
                text="➕ إضافة Block", callback_data="r:addmenu", style=ButtonStyle.PRIMARY,
            ),
        ]])
    rows = [
        [InlineKeyboardButton(text=get_block_button_text(block, index), callback_data=f"r:b:{block['id']}")]
        for index, block in enumerate(sorted(blocks, key=lambda item: item["position"]))
    ]
    rows.append([
        InlineKeyboardButton(text=t("editor.tools_button"), callback_data="r:tools"),
        InlineKeyboardButton(
            text="➕ إضافة Block", callback_data="r:addmenu", style=ButtonStyle.PRIMARY,
        ),
    ])
    rows.append([
        InlineKeyboardButton(
            text="📝 إنشاء منشور", callback_data="r:post", style=ButtonStyle.PRIMARY,
        ),
        InlineKeyboardButton(
            text="✅ النتيجة", callback_data="r:result", style=ButtonStyle.SUCCESS,
        ),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_editor_tools_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🔘 إضافة أزرار", callback_data="r:buttons"),
            InlineKeyboardButton(
                text="💾 حفظ الصفحة", callback_data="r:savepage",
                style=ButtonStyle.SUCCESS,
            ),
        ],
        [
            InlineKeyboardButton(text="📚 صفحاتي", callback_data="r:pages"),
            InlineKeyboardButton(text=t("editor.undo_button"), callback_data="r:undo"),
        ],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")],
    ])


def build_result_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="✅ النتيجة", callback_data="r:result", style=ButtonStyle.SUCCESS,
        ),
    ]])


__all__ = [
    "build_editor_tools_keyboard",
    "build_result_keyboard",
    "build_rich_editor_keyboard",
    "build_start_editor_keyboard",
    "build_welcome_keyboard",
]

from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def build_post_chats_keyboard(
    chats: list[dict[str, Any]],
    channel_url: str,
    group_url: str,
    selected_chat_ids: list[int] | None = None,
) -> InlineKeyboardMarkup:
    selected = set(selected_chat_ids or [])
    rows: list[list[InlineKeyboardButton]] = []
    for chat in chats:
        chat_id = int(chat["chat_id"])
        icon = "📢" if chat.get("type") == "channel" else "👥"
        rows.append([InlineKeyboardButton(
            text=f"{'✅' if chat_id in selected else '⬜'} {icon} {chat.get('title') or chat_id}",
            callback_data=f"r:postchat:{chat_id}",
        )])
    if chats:
        rows.append([InlineKeyboardButton(
            text=f"⚙️ إعدادات وإرسال ({len(selected)})",
            callback_data="r:postsettings",
            style=ButtonStyle.SUCCESS,
        )])
    rows.extend([
        [InlineKeyboardButton(
            text="➕ إضافة البوت إلى قناة", url=channel_url,
            style=ButtonStyle.PRIMARY,
        )],
        [InlineKeyboardButton(
            text="➕ إضافة البوت إلى مجموعة", url=group_url,
            style=ButtonStyle.PRIMARY,
        )],
    ])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_chat_reached_keyboard(chat_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📝 إرسال المنشور", callback_data=f"r:postchat:{chat_id}",
            style=ButtonStyle.SUCCESS,
        ),
    ]])


def build_post_settings_keyboard(
    *, silent: bool, protected: bool, selected_count: int = 1,
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🔕 منشور صامت", callback_data="r:pt:silent"),
            InlineKeyboardButton(text="✅" if silent else "❌", callback_data="r:pt:silent"),
        ],
        [
            InlineKeyboardButton(text="🛡 منشور محمي", callback_data="r:pt:protected"),
            InlineKeyboardButton(text="✅" if protected else "❌", callback_data="r:pt:protected"),
        ],
        [InlineKeyboardButton(
            text=f"📤 إرسال إلى {selected_count} محادثة", callback_data="r:postsend",
            style=ButtonStyle.SUCCESS,
        )],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:postlist")],
    ])


__all__ = [
    "build_chat_reached_keyboard",
    "build_post_chats_keyboard",
    "build_post_settings_keyboard",
]

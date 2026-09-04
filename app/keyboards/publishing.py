from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.i18n import t


def build_post_back_keyboard(callback_data: str = "r:back") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=t("ux.common.back"), callback_data=callback_data),
    ]])


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
        is_selected = chat_id in selected
        icon = "📢" if chat.get("type") == "channel" else "👥"
        rows.append([InlineKeyboardButton(
            text=f"{'✅' if is_selected else '⬜'} {icon} {chat.get('title') or chat_id}",
            callback_data=f"r:postchat:{chat_id}",
            style=ButtonStyle.SUCCESS if is_selected else ButtonStyle.PRIMARY,
        )])
    if chats:
        rows.append([InlineKeyboardButton(
            text=f"⚙️ إعدادات وإرسال ({len(selected)})",
            callback_data="r:postsettings",
            style=ButtonStyle.SUCCESS,
        )])
    rows.append([
        InlineKeyboardButton(
            text="➕ إضافة البوت إلى قناة", url=channel_url,
            style=ButtonStyle.PRIMARY,
        ),
        InlineKeyboardButton(
            text="➕ إضافة البوت إلى مجموعة", url=group_url,
            style=ButtonStyle.PRIMARY,
        ),
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
        [InlineKeyboardButton(
            text=t("ux.publish.silent_on" if silent else "ux.publish.silent_off"),
            callback_data="r:pt:silent",
            style=ButtonStyle.SUCCESS if silent else None,
        )],
        [InlineKeyboardButton(
            text=t("ux.publish.protected_on" if protected else "ux.publish.protected_off"),
            callback_data="r:pt:protected",
            style=ButtonStyle.SUCCESS if protected else None,
        )],
        [InlineKeyboardButton(
            text=t("ux.publish.send", count=selected_count), callback_data="r:postconfirm",
            style=ButtonStyle.SUCCESS,
        )],
        [InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:postlist")],
    ])


def build_post_confirmation_keyboard(selected_count: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t("ux.publish.confirm_yes"), callback_data="r:postsend",
            style=ButtonStyle.SUCCESS,
        )],
        [InlineKeyboardButton(
            text=t("ux.common.cancel"), callback_data="r:postsettings",
        )],
    ])


__all__ = [
    "build_chat_reached_keyboard",
    "build_post_back_keyboard",
    "build_post_chats_keyboard",
    "build_post_confirmation_keyboard",
    "build_post_settings_keyboard",
]

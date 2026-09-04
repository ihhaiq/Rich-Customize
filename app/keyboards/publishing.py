from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.i18n import t


POST_CHAT_COLUMNS = 2


def _post_chat_button(chat: dict[str, Any], selected: set[int]) -> InlineKeyboardButton:
    chat_id = int(chat["chat_id"])
    is_selected = chat_id in selected
    status_icon = "🟢" if is_selected else "⚪"
    chat_icon = "📢" if chat.get("type") == "channel" else "👥"
    title = chat.get("title") or chat_id
    return InlineKeyboardButton(
        text=f"{status_icon} {chat_icon} {title}",
        callback_data=f"r:postchat:{chat_id}",
        style=ButtonStyle.SUCCESS if is_selected else ButtonStyle.PRIMARY,
    )


def _button_grid(
    buttons: list[InlineKeyboardButton],
    columns: int = POST_CHAT_COLUMNS,
) -> list[list[InlineKeyboardButton]]:
    return [buttons[index:index + columns] for index in range(0, len(buttons), columns)]


def build_post_chats_keyboard(
    chats: list[dict[str, Any]],
    channel_url: str,
    group_url: str,
    selected_chat_ids: list[int] | None = None,
) -> InlineKeyboardMarkup:
    selected = set(selected_chat_ids or [])
    chat_buttons = [_post_chat_button(chat, selected) for chat in chats]
    rows = _button_grid(chat_buttons)

    if chats:
        rows.append([InlineKeyboardButton(
            text=f"⚙️ إعدادات وإرسال ({len(selected)})",
            callback_data="r:postsettings",
            style=ButtonStyle.SUCCESS,
        )])

    rows.append([
        InlineKeyboardButton(
            text="➕ إضافة البوت إلى قناة",
            url=channel_url,
            style=ButtonStyle.PRIMARY,
        ),
        InlineKeyboardButton(
            text="➕ إضافة البوت إلى مجموعة",
            url=group_url,
            style=ButtonStyle.PRIMARY,
        ),
    ])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_chat_reached_keyboard(chat_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📝 إرسال المنشور",
            callback_data=f"r:postchat:{chat_id}",
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
            style=ButtonStyle.SUCCESS if silent else ButtonStyle.PRIMARY,
        )],
        [InlineKeyboardButton(
            text=t("ux.publish.protected_on" if protected else "ux.publish.protected_off"),
            callback_data="r:pt:protected",
            style=ButtonStyle.SUCCESS if protected else ButtonStyle.PRIMARY,
        )],
        [InlineKeyboardButton(
            text=t("ux.publish.send", count=selected_count),
            callback_data="r:postconfirm",
            style=ButtonStyle.SUCCESS,
        )],
        [InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:postlist")],
    ])


def build_post_confirmation_keyboard(selected_count: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t("ux.publish.confirm_yes"),
            callback_data="r:postsend",
            style=ButtonStyle.SUCCESS,
        )],
        [InlineKeyboardButton(
            text=t("ux.common.cancel"),
            callback_data="r:postsettings",
            style=ButtonStyle.DANGER,
        )],
    ])


__all__ = [
    "build_chat_reached_keyboard",
    "build_post_chats_keyboard",
    "build_post_confirmation_keyboard",
    "build_post_settings_keyboard",
]

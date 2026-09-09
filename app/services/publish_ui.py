from __future__ import annotations

from typing import Any

from aiogram.exceptions import TelegramBadRequest
from aiogram.types import InlineKeyboardMarkup, InputRichMessage, Message

from app.i18n import t


def _rich_button(
    text: str,
    *,
    callback_data: str | None = None,
    url: str | None = None,
    style: str | None = None,
) -> dict[str, Any]:
    button: dict[str, Any] = {"text": text}
    if callback_data is not None:
        button["callback_data"] = callback_data
    if url is not None:
        button["url"] = url
    if style in {"primary", "success", "danger"}:
        button["style"] = style
    return {"type": "button", "button": button}


def _cell(
    text: Any,
    *,
    colspan: int | None = None,
) -> dict[str, Any]:
    cell: dict[str, Any] = {
        "text": text,
        "align": "center",
        "valign": "middle",
    }
    if colspan is not None:
        cell["colspan"] = colspan
    return cell


def _panel(text: str, rows: list[list[dict[str, Any]]]) -> InputRichMessage:
    return InputRichMessage(
        blocks=[
            {"type": "paragraph", "text": text},
            {
                "type": "table",
                "cells": rows,
                "is_bordered": True,
                "is_compact": True,
            },
        ],
    )


def _chat_link(chat: dict[str, Any], chat_id: int) -> str:
    explicit_link = str(chat.get("url") or chat.get("invite_link") or "").strip()
    if explicit_link.startswith(("http://", "https://", "tg://")):
        return explicit_link

    username = str(chat.get("username") or "").strip().lstrip("@")
    if username:
        return f"https://t.me/{username}"

    numeric_id = str(abs(chat_id))
    if chat.get("type") in {"channel", "supergroup"} and numeric_id.startswith("100"):
        return f"https://t.me/c/{numeric_id[3:]}/1"
    return f"tg://openmessage?chat_id={numeric_id}"


async def edit_publish_ui(
    message: Message,
    rich_message: InputRichMessage,
    reply_markup: InlineKeyboardMarkup,
) -> None:
    try:
        await message.bot.edit_message_text(
            chat_id=message.chat.id,
            message_id=message.message_id,
            rich_message=rich_message,
            reply_markup=reply_markup,
        )
    except TelegramBadRequest as error:
        if "message is not modified" not in str(error).lower():
            raise


def build_post_picker_rich_message(
    text: str,
    chats: list[dict[str, Any]],
    channel_url: str,
    group_url: str,
    selected_chat_ids: list[int] | None = None,
) -> InputRichMessage:
    selected = set(selected_chat_ids or [])
    rows: list[list[dict[str, Any]]] = []

    for chat in chats:
        chat_id = int(chat["chat_id"])
        is_selected = chat_id in selected
        state_icon = "✅" if is_selected else "⬜"
        chat_icon = "📢" if chat.get("type") == "channel" else "👥"
        title = str(chat.get("title") or chat_id)
        rows.append([
            _cell(
                _rich_button(
                    f"{chat_icon} {title}",
                    url=_chat_link(chat, chat_id),
                ),
            ),
            _cell(
                _rich_button(
                    f"{state_icon} {t('ux.publish.select')}",
                    callback_data=f"r:postchat:{chat_id}",
                    style="success" if is_selected else "primary",
                ),
            ),
        ])

    if chats:
        rows.append([
            _cell(
                _rich_button(
                    f"{t('publish.settings_send')} ({len(selected)})",
                    callback_data="r:postsettings",
                    style="success",
                ),
                colspan=2,
            ),
        ])

    rows.append([
        _cell(
            _rich_button(
                t("publish.add_bot_channel"),
                url=channel_url,
                style="primary",
            ),
        ),
        _cell(
            _rich_button(
                t("publish.add_bot_group"),
                url=group_url,
                style="primary",
            ),
        ),
    ])
    return _panel(text, rows)


def build_post_settings_rich_message(
    text: str,
    *,
    silent: bool,
    protected: bool,
    selected_count: int,
) -> InputRichMessage:
    rows = [
        [
            _cell(
                _rich_button(
                    t("ux.publish.silent_on" if silent else "ux.publish.silent_off"),
                    callback_data="r:pt:silent",
                    style="success" if silent else "primary",
                ),
                colspan=2,
            ),
        ],
        [
            _cell(
                _rich_button(
                    t("ux.publish.protected_on" if protected else "ux.publish.protected_off"),
                    callback_data="r:pt:protected",
                    style="success" if protected else "primary",
                ),
                colspan=2,
            ),
        ],
        [
            _cell(
                _rich_button(
                    t("ux.publish.send", count=selected_count),
                    callback_data="r:postconfirm",
                    style="success",
                ),
                colspan=2,
            ),
        ],
    ]
    return _panel(text, rows)


def build_post_confirmation_rich_message(
    text: str,
) -> InputRichMessage:
    return _panel(
        text,
        [[
            _cell(
                _rich_button(
                    t("ux.publish.confirm_yes"),
                    callback_data="r:postsend",
                    style="success",
                ),
                colspan=2,
            ),
        ]],
    )


__all__ = [
    "build_post_confirmation_rich_message",
    "build_post_picker_rich_message",
    "build_post_settings_rich_message",
    "edit_publish_ui",
]

from __future__ import annotations

from typing import Any

from aiogram.types import InputRichMessage

from app.i18n import t, tr


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
    text: dict[str, Any],
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
                    f"{state_icon} {chat_icon} {title}",
                    callback_data=f"r:postchat:{chat_id}",
                    style="success" if is_selected else "primary",
                ),
                colspan=2,
            ),
        ])

    if chats:
        rows.append([
            _cell(
                _rich_button(
                    tr("⚙️ إعدادات وإرسال") + f" ({len(selected)})",
                    callback_data="r:postsettings",
                    style="success",
                ),
                colspan=2,
            ),
        ])

    rows.append([
        _cell(
            _rich_button(
                tr("➕ إضافة البوت إلى قناة"),
                url=channel_url,
                style="primary",
            ),
        ),
        _cell(
            _rich_button(
                tr("➕ إضافة البوت إلى مجموعة"),
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
]

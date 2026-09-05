from __future__ import annotations

from aiogram.types import InputRichMessage, User

from app.i18n import t

SHOWCASE_URL = "https://t.me/durov/531"
UPDATES_URL = "https://t.me/RichCustomizet"
SUPPORT_URL = "https://t.me/+D4cEzE0V7IIwYTcx"
ADD_GROUP_URL = "https://t.me/RichCustomizebot?startgroup=true"
BOT_USERNAME = "@RichCustomizebot"


def _url_button(text: str, url: str) -> dict[str, object]:
    return {
        "type": "button",
        "button": {
            "text": text,
            "url": url,
        },
    }


def build_welcome_rich_message(user: User) -> InputRichMessage:
    """Build the localized /start message with a compact visual hierarchy."""
    mention_text = user.full_name.strip() or str(user.id)
    greeting: list[object] = [
        f"{t('welcome.greeting')} ",
        {
            "type": "text_mention",
            "text": mention_text,
            "user": user,
        },
        "!",
    ]
    intro: list[object] = [
        t("welcome.product_description"),
        " ",
        _url_button(t("welcome.view_button"), SHOWCASE_URL),
    ]
    help_text: list[object] = [
        t("welcome.help_title"),
        "\n",
        f"{t('welcome.help_check')} ",
        _url_button(t("welcome.updates_button"), UPDATES_URL),
        f" {t('welcome.and')} ",
        _url_button(t("welcome.support_button"), SUPPORT_URL),
    ]
    return InputRichMessage(blocks=[
        {
            "type": "heading",
            "text": greeting,
            "size": 3,
        },
        {
            "type": "table",
            "cells": [[{
                "text": f"- {BOT_USERNAME}",
                "align": "left",
                "valign": "middle",
            }]],
            "is_compact": True,
        },
        {
            "type": "paragraph",
            "text": intro,
        },
        {
            "type": "footer",
            "text": help_text,
        },
    ])


__all__ = [
    "ADD_GROUP_URL",
    "BOT_USERNAME",
    "SHOWCASE_URL",
    "SUPPORT_URL",
    "UPDATES_URL",
    "build_welcome_rich_message",
]

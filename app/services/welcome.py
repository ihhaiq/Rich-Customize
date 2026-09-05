from __future__ import annotations

from aiogram.types import InputRichMessage, User

from app.i18n import t

SHOWCASE_URL = "https://t.me/TelegramTips/573"
UPDATES_URL = "https://t.me/RichCustomizet"
SUPPORT_URL = "https://t.me/+D4cEzE0V7IIwYTcx"
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
    """Build the /start message using Telegram RichText buttons and a real user mention."""
    mention_text = user.full_name.strip() or str(user.id)
    text: list[object] = [
        f"{t('welcome.greeting')} ",
        {
            "type": "text_mention",
            "text": mention_text,
            "user": user,
        },
        f"!\n{BOT_USERNAME}\n",
        t("welcome.description_before_view"),
        _url_button(t("welcome.view_button"), SHOWCASE_URL),
        t("welcome.description_after_view"),
        "\n\n",
        t("welcome.add_prompt"),
        "\n\n",
        t("welcome.help_title"),
        "\n",
        f"{t('welcome.help_check')} ",
        _url_button(t("welcome.updates_button"), UPDATES_URL),
        " && ",
        _url_button(t("welcome.support_button"), SUPPORT_URL),
    ]
    return InputRichMessage(blocks=[{"type": "paragraph", "text": text}])


__all__ = [
    "BOT_USERNAME",
    "SHOWCASE_URL",
    "SUPPORT_URL",
    "UPDATES_URL",
    "build_welcome_rich_message",
]

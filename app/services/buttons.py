from __future__ import annotations

import secrets
import re
from typing import Any
from urllib.parse import urlparse


BUTTON_STYLES = {"default", "primary", "success", "danger"}
MAX_BUTTONS = 100
TELEGRAM_USERNAME_RE = re.compile(r"^@[A-Za-z0-9_]{5,32}$")


def normalize_button_positions(buttons: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buttons.sort(key=lambda item: int(item.get("position", 0)))
    return reindex_buttons(buttons)


def reindex_buttons(buttons: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for position, button in enumerate(buttons):
        button["position"] = position
        if button.get("style") not in BUTTON_STYLES:
            button["style"] = "default"
    return buttons


def get_message_button(
    buttons: list[dict[str, Any]], button_id: str,
) -> dict[str, Any] | None:
    return next((button for button in buttons if button.get("id") == button_id), None)


def normalize_button_url(value: str) -> str | None:
    url = value.strip()
    if TELEGRAM_USERNAME_RE.fullmatch(url):
        return f"https://t.me/{url[1:]}"
    if url.startswith(("t.me/", "telegram.me/")):
        url = f"https://{url}"
    parsed = urlparse(url)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return url
    if parsed.scheme == "tg" and (parsed.netloc or parsed.path):
        return url
    return None


def add_message_button(
    buttons: list[dict[str, Any]], text: str, url: str,
) -> dict[str, Any] | None:
    if len(buttons) >= MAX_BUTTONS:
        return None
    button = {
        "id": secrets.token_hex(5),
        "text": text.strip(),
        "url": url,
        "style": "default",
        "position": len(buttons),
    }
    buttons.append(button)
    return button


def delete_message_button(buttons: list[dict[str, Any]], button_id: str) -> bool:
    button = get_message_button(buttons, button_id)
    if button is None:
        return False
    buttons.remove(button)
    normalize_button_positions(buttons)
    return True


def move_message_button(
    buttons: list[dict[str, Any]], button_id: str, new_index: int,
) -> bool:
    normalize_button_positions(buttons)
    button = get_message_button(buttons, button_id)
    if button is None or not 0 <= new_index < len(buttons):
        return False
    old_index = buttons.index(button)
    if old_index != new_index:
        buttons.insert(new_index, buttons.pop(old_index))
    reindex_buttons(buttons)
    return True
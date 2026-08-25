from __future__ import annotations

import re
import secrets
from typing import Any
from urllib.parse import urlparse


BUTTON_STYLES = {"default", "primary", "success", "danger", "link"}
BUTTON_TYPES = {
    "url", "callback_data", "copy", "popup", "web_app", "login_url",
    "switch_inline", "switch_inline_current", "disabled",
}
MAX_BUTTONS = 100
TELEGRAM_USERNAME_RE = re.compile(r"^@[A-Za-z0-9_]{5,32}$")
BARE_TELEGRAM_USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{5,32}$")


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


def get_button_type(button: dict[str, Any]) -> str:
    value = str(button.get("type", "url"))
    return value if value in BUTTON_TYPES else "url"


def get_button_value(button: dict[str, Any]) -> str:
    if button.get("value") is not None:
        return str(button["value"])
    return str(button.get("url", ""))


def normalize_button_url(value: str) -> str | None:
    url = value.strip()
    if TELEGRAM_USERNAME_RE.fullmatch(url):
        return f"https://t.me/{url[1:]}"
    if url.startswith(("t.me/", "telegram.me/")):
        url = f"https://{url}"
    parsed = urlparse(url)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        hostname = parsed.hostname or ""
        if (
            "." not in hostname
            and not parsed.path.strip("/")
            and BARE_TELEGRAM_USERNAME_RE.fullmatch(hostname)
        ):
            return f"https://t.me/{hostname}"
        if "." not in hostname:
            return None
        return url
    if parsed.scheme == "tg" and (parsed.netloc or parsed.path):
        return url
    return None


def normalize_https_url(value: str) -> str | None:
    url = normalize_button_url(value)
    if url and urlparse(url).scheme == "https":
        return url
    return None


def add_message_button(
    buttons: list[dict[str, Any]], text: str, value: str,
    button_type: str = "url",
) -> dict[str, Any] | None:
    if len(buttons) >= MAX_BUTTONS or button_type not in BUTTON_TYPES:
        return None
    button = {
        "id": secrets.token_hex(5),
        "text": text.strip(),
        "type": button_type,
        "value": value,
        "style": "default",
        "position": len(buttons),
    }
    if button_type in {"url", "web_app", "login_url"}:
        button["url"] = value
    buttons.append(button)
    return button


def change_message_button_type(
    button: dict[str, Any], button_type: str, value: str,
) -> bool:
    if button_type not in BUTTON_TYPES:
        return False
    button["type"] = button_type
    button["value"] = value
    button.pop("popup_token", None)
    if button_type in {"url", "web_app", "login_url"}:
        button["url"] = value
    else:
        button.pop("url", None)
    if button.get("style") == "link" and button_type != "popup":
        button["style"] = "default"
    return True


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

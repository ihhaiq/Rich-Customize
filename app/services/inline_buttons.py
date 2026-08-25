from __future__ import annotations

import re
from typing import Any


MARKER_RE = re.compile(r"\{([^{}\n]+)\}")
COLOR_STYLES = {
    "r": "danger",
    "b": "primary",
    "p": "primary",
    "g": "success",
}
TYPE_ALIASES = {
    "link": "url",
    "callback": "callback_data",
    "webapp": "web_app",
    "login": "login_url",
    "inline": "switch_inline_query",
    "current": "switch_inline_query_current_chat",
}


def _marker_parts(marker: str) -> tuple[str, str, str, str | None] | None:
    if not marker.startswith("{") or not marker.endswith("}"):
        return None
    body = marker[1:-1].strip()
    if ":" not in body:
        return None
    title, specification = body.split(":", 1)
    title = title.strip()
    specification = specification.strip()
    if not title or len(title) > 64 or not specification:
        return None

    color: str | None = None
    color_match = re.search(r"#([rbpg])\s*$", specification, flags=re.IGNORECASE)
    if color_match:
        color = color_match.group(1).lower()
        specification = specification[:color_match.start()].rstrip()

    pieces = specification.split(maxsplit=1)
    button_type = TYPE_ALIASES.get(pieces[0].lower(), pieces[0].lower())
    value = pieces[1].strip() if len(pieces) == 2 else ""
    return title, button_type, value, color


def find_user_button_markers(text: str | None) -> list[dict[str, str | None]]:
    markers: list[dict[str, str | None]] = []
    for match in MARKER_RE.finditer(text or ""):
        marker = match.group(0)
        parts = _marker_parts(marker)
        if not parts:
            continue
        title, button_type, value, color = parts
        if button_type == "user" and not value:
            markers.append({"marker": marker, "title": title, "color": color})
    return markers


def resolve_user_button_marker(
    blocks: list[dict[str, Any]], marker: str, user_id: int,
) -> None:
    replacement_parts = _marker_parts(marker)
    if not replacement_parts:
        return
    title, _, _, color = replacement_parts
    suffix = f"#{color}" if color else ""
    replacement = f"{{{title}:url tg://user?id={user_id}{suffix}}}"

    def replace(value: Any) -> Any:
        if isinstance(value, str):
            return value.replace(marker, replacement, 1)
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        return value

    for index, block in enumerate(blocks):
        blocks[index] = replace(block)


def _button_payload(title: str, button_type: str, value: str, color: str | None) -> dict[str, Any] | None:
    style = COLOR_STYLES.get(color or "")
    button: dict[str, Any] = {"text": title}
    if style:
        button["style"] = style

    if button_type == "url":
        if not value.startswith(("http://", "https://", "tg://")):
            return None
        button["url"] = value
    elif button_type == "user":
        if not value.isdigit():
            return None
        button["url"] = f"tg://user?id={value}"
    elif button_type == "callback_data":
        if not 1 <= len(value.encode("utf-8")) <= 64:
            return None
        button["callback_data"] = value
    elif button_type == "copy":
        if not value or len(value) > 256:
            return None
        button["copy_text"] = {"text": value}
    elif button_type == "popup":
        if not 1 <= len(value.encode("utf-8")) <= 64:
            return None
        button["callback_data"] = value
    elif button_type == "web_app":
        if not value.startswith("https://"):
            return None
        button["web_app"] = {"url": value}
    elif button_type == "login_url":
        if not value.startswith("https://"):
            return None
        button["login_url"] = {"url": value}
    elif button_type == "switch_inline_query":
        button["switch_inline_query"] = "" if value == "/empty" else value
    elif button_type == "switch_inline_query_current_chat":
        button["switch_inline_query_current_chat"] = "" if value == "/empty" else value
    elif button_type == "disabled":
        button["disabled"] = {}
    else:
        return None
    return {"type": "button", "button": button}


def inline_button_rich_text(value: Any) -> Any:
    """Replace valid inline button markers while preserving nested RichText."""
    if isinstance(value, list):
        result: list[Any] = []
        for item in value:
            parsed = inline_button_rich_text(item)
            if isinstance(parsed, list):
                result.extend(parsed)
            else:
                result.append(parsed)
        return result
    if isinstance(value, dict):
        payload = dict(value)
        if "text" in payload:
            payload["text"] = inline_button_rich_text(payload["text"])
        return payload
    if not isinstance(value, str):
        return value

    result: list[Any] = []
    cursor = 0
    changed = False
    for match in MARKER_RE.finditer(value):
        parts = _marker_parts(match.group(0))
        if not parts:
            continue
        payload = _button_payload(*parts)
        if payload is None:
            continue
        if match.start() > cursor:
            result.append(value[cursor:match.start()])
        result.append(payload)
        cursor = match.end()
        changed = True
    if not changed:
        return value
    if cursor < len(value):
        result.append(value[cursor:])
    return result[0] if len(result) == 1 else result

from __future__ import annotations

from typing import Any

from app.i18n import t
from app.services.blocks import normalize_block_positions


PULLQUOTE_MEDIA_TYPES = {
    "photo", "video", "animation", "audio", "voice", "document",
}


def math_input_prompt(*, editing: bool = False) -> str:
    return t("math.edit_prompt" if editing else "math.add_prompt")


def code_input_prompt(*, editing: bool = False) -> str:
    return t("code.edit_prompt" if editing else "code.add_prompt")


def quote_media_payload(
    parsed: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    media = [item for item in parsed if item.get("type") in PULLQUOTE_MEDIA_TYPES]
    normalize_block_positions(media)
    caption = next((item for item in parsed if item.get("type") == "caption"), None)
    return media, caption


__all__ = [
    "PULLQUOTE_MEDIA_TYPES",
    "code_input_prompt",
    "math_input_prompt",
    "quote_media_payload",
]

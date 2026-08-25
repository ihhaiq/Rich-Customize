from __future__ import annotations

import asyncio
import copy
import html
import logging
import secrets
from html.parser import HTMLParser
from typing import Any

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import (
    CopyTextButton, DisabledButton, InputMediaAnimation, InputMediaAudio,
    InputMediaDocument, InputMediaPhoto, InputMediaVideo, InputMediaVoiceNote,
    InputRichMessage, InputRichMessageMedia, InlineKeyboardMarkup,
)
from pydantic import ValidationError

from app.i18n import preserve_user_content, tr
from app.services.inline_buttons import inline_button_rich_text

logger = logging.getLogger(__name__)

RICH_MEDIA = {"photo", "video", "animation", "audio", "voice", "document"}
HTML_BLOCKS = {
    "text", "paragraph", "heading", "preformatted", "footer", "caption",
    "divider", "list", "table", "mathematical_expression", "anchor",
}


class RichMessageRenderError(RuntimeError):
    """Raised when one rich message can't be built or accepted by Telegram."""


def _with_caption(content: str, data: dict[str, Any]) -> str:
    caption = data.get("caption_html")
    credit = data.get("credit_html")
    if not caption and not credit:
        return content
    caption_body = caption or ""
    if credit:
        caption_body += f"<cite>{credit}</cite>"
    return f"<figure>{content}<figcaption>{caption_body}</figcaption></figure>"


def _file_id(block: dict[str, Any]) -> str | None:
    data = block.get("data", {})
    if data.get("file", {}).get("file_id"):
        return data["file"]["file_id"]
    native = data.get("native_data", {})
    value = native.get({"voice": "voice_note"}.get(block["type"], block["type"]))
    if isinstance(value, list) and value:
        return value[-1].get("file_id")
    if isinstance(value, dict):
        return value.get("file_id")
    return None


def _input_media(block: dict[str, Any], file_id: str):
    data = block.get("data", {})
    file_data = data.get("file", {})
    kind = block["type"]
    if kind == "photo":
        return InputMediaPhoto(
            media=file_id, has_spoiler=data.get("has_spoiler"), parse_mode=None,
            show_caption_above_media=None,
        )
    if kind == "video":
        return InputMediaVideo(
            media=file_id, width=file_data.get("width"), height=file_data.get("height"),
            duration=file_data.get("duration"), supports_streaming=file_data.get("supports_streaming"),
            has_spoiler=data.get("has_spoiler"), parse_mode=None,
            show_caption_above_media=None,
        )
    if kind == "animation":
        return InputMediaAnimation(
            media=file_id, width=file_data.get("width"), height=file_data.get("height"),
            duration=file_data.get("duration"), has_spoiler=data.get("has_spoiler"),
            parse_mode=None, show_caption_above_media=None,
        )
    if kind == "audio":
        return InputMediaAudio(
            media=file_id, duration=file_data.get("duration"),
            performer=file_data.get("performer"), title=file_data.get("title"),
            parse_mode=None,
        )
    if kind == "document":
        return InputMediaDocument(
            media=file_id,
            disable_content_type_detection=file_data.get("disable_content_type_detection"),
            parse_mode=None,
        )
    return InputMediaVoiceNote(media=file_id, duration=file_data.get("duration"))


def _native_media_file_id(value: Any) -> tuple[str | None, dict[str, Any]]:
    if isinstance(value, list) and value:
        item = value[-1]
    elif isinstance(value, dict):
        item = value
    else:
        return None, {}
    return item.get("file_id"), item


def _native_input_block(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert a received RichBlock payload to its sendable InputRichBlock form."""
    payload = copy.deepcopy(raw)
    kind = str(payload.get("type", ""))

    if "blocks" in payload:
        payload["blocks"] = [_native_input_block(item) for item in payload.get("blocks", [])]
    if kind == "list":
        for item in payload.get("items", []):
            item["blocks"] = [_native_input_block(child) for child in item.get("blocks", [])]

    media_field = {
        "photo": "photo",
        "video": "video",
        "animation": "animation",
        "audio": "audio",
        "document": "document",
        "voice_note": "voice_note",
    }.get(kind)
    if media_field is None:
        return payload

    file_id, source = _native_media_file_id(payload.get(media_field))
    if not file_id:
        raise RichMessageRenderError(f"Native {kind} block has no reusable file_id")
    has_spoiler = payload.pop("has_spoiler", None)
    if kind == "photo":
        payload[media_field] = InputMediaPhoto(
            media=file_id, has_spoiler=has_spoiler, parse_mode=None,
            show_caption_above_media=None,
        )
    elif kind == "video":
        payload[media_field] = InputMediaVideo(
            media=file_id,
            width=source.get("width"), height=source.get("height"),
            duration=source.get("duration"), supports_streaming=source.get("supports_streaming"),
            has_spoiler=has_spoiler, parse_mode=None,
            show_caption_above_media=None,
        )
    elif kind == "animation":
        payload[media_field] = InputMediaAnimation(
            media=file_id,
            width=source.get("width"), height=source.get("height"),
            duration=source.get("duration"), has_spoiler=has_spoiler,
            parse_mode=None, show_caption_above_media=None,
        )
    elif kind == "audio":
        payload[media_field] = InputMediaAudio(
            media=file_id,
            duration=source.get("duration"), performer=source.get("performer"),
            title=source.get("title"), parse_mode=None,
        )
    elif kind == "document":
        payload[media_field] = InputMediaDocument(
            media=file_id,
            disable_content_type_detection=source.get("disable_content_type_detection"),
            parse_mode=None,
        )
    else:
        payload[media_field] = InputMediaVoiceNote(
            media=file_id,
            duration=source.get("duration"),
        )
    return payload


def _native_input_rich_message(blocks: list[dict[str, Any]]) -> InputRichMessage | None:
    if not blocks or not all(
        block.get("data", {}).get("native")
        and isinstance(block.get("data", {}).get("native_data"), dict)
        for block in blocks
    ):
        return None
    ordered = sorted(blocks, key=lambda item: item["position"])
    payloads = [_native_input_block(block["data"]["native_data"]) for block in ordered]
    # Leave direction unset so Telegram detects RTL/LTR from the message text.
    # Forcing is_rtl=True makes Latin paragraphs render on the right.
    return InputRichMessage(blocks=payloads)


class _RichTextHTMLParser(HTMLParser):
    """Turn Telegram's inline HTML subset into a RichText payload."""

    _WRAPPERS = {
        "b": "bold", "strong": "bold", "i": "italic", "em": "italic",
        "u": "underline", "ins": "underline", "s": "strikethrough",
        "strike": "strikethrough", "del": "strikethrough",
        "tg-spoiler": "spoiler", "code": "code", "mark": "marked",
        "sub": "subscript", "sup": "superscript",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, dict[str, str], list[Any]]] = [("root", {}, [])]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "br":
            self.stack[-1][2].append("\n")
            return
        self.stack.append((tag, {key: value or "" for key, value in attrs}, []))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() != "br":
            self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        if data:
            self.stack[-1][2].append(data)

    @staticmethod
    def _content(parts: list[Any]) -> Any:
        compact = [part for part in parts if part not in (None, "", [])]
        if not compact:
            return ""
        return compact[0] if len(compact) == 1 else compact

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if len(self.stack) == 1:
            return
        open_tag, attrs, parts = self.stack.pop()
        if open_tag != tag:
            self.stack[-1][2].extend(parts)
            return
        content = self._content(parts)
        wrapped: Any = content
        rich_type = self._WRAPPERS.get(tag)
        if rich_type and content != "":
            wrapped = {"type": rich_type, "text": content}
        elif tag == "a" and content != "":
            href = attrs.get("href", "")
            if href.startswith("mailto:"):
                wrapped = {"type": "email_address", "text": content, "email_address": href[7:]}
            elif href.startswith("tel:"):
                wrapped = {"type": "phone_number", "text": content, "phone_number": href[4:]}
            elif href.startswith("#"):
                wrapped = {"type": "anchor_link", "text": content, "anchor_name": href[1:]}
            elif href:
                wrapped = {"type": "url", "text": content, "url": href}
        elif tag == "tg-emoji":
            emoji_id = attrs.get("emoji-id", "")
            if emoji_id:
                wrapped = {
                    "type": "custom_emoji", "custom_emoji_id": emoji_id,
                    "alternative_text": _plain_rich_text(content) or "🙂",
                }
        self.stack[-1][2].append(wrapped)

    def result(self) -> Any:
        while len(self.stack) > 1:
            self.handle_endtag(self.stack[-1][0])
        return self._content(self.stack[0][2])


def _plain_rich_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(_plain_rich_text(item) for item in value)
    if isinstance(value, dict):
        return _plain_rich_text(value.get("text", value.get("alternative_text", "")))
    return "" if value is None else str(value)


def _html_rich_text(value: Any, fallback: str = "") -> Any:
    if not value:
        return fallback
    if not isinstance(value, str):
        return value
    parser = _RichTextHTMLParser()
    try:
        parser.feed(value)
        parsed = parser.result()
        return parsed if parsed not in ("", []) else fallback
    except Exception:
        return html.unescape(value) or fallback


def _data_rich_text(data: dict[str, Any], rich_key: str, html_key: str, text_key: str) -> Any:
    if data.get(rich_key) not in (None, "", []):
        return inline_button_rich_text(data[rich_key])
    return inline_button_rich_text(
        _html_rich_text(data.get(html_key), str(data.get(text_key, ""))),
    )


def _caption_payload(data: dict[str, Any]) -> dict[str, Any] | None:
    text = _data_rich_text(data, "caption_rich_text", "caption_html", "caption_text")
    credit = _data_rich_text(data, "credit_rich_text", "credit_html", "credit_text")
    if text in (None, "", []) and credit in (None, "", []):
        return None
    return {"text": text or "", "credit": credit or None}


def _editor_input_block(block: dict[str, Any], path: str) -> dict[str, Any]:
    """Serialize every editor block to the typed Bot API representation."""
    kind = str(block.get("type", ""))
    data = block.get("data", {})
    native_data = data.get("native_data")
    if data.get("native") and isinstance(native_data, dict):
        return _native_input_block(native_data)

    text = _data_rich_text(data, "rich_text", "html", "text")
    if kind in {"text", "paragraph", "caption"}:
        return {"type": "paragraph", "text": text or ""}
    if kind == "heading":
        return {"type": "heading", "text": text or "", "size": max(1, min(6, int(data.get("size", 2))))}
    if kind == "preformatted":
        return {"type": "pre", "text": data.get("text", _plain_rich_text(text)), "language": data.get("language")}
    if kind == "footer":
        return {"type": "footer", "text": text or ""}
    if kind == "divider":
        return {"type": "divider"}
    if kind == "mathematical_expression":
        return {"type": "mathematical_expression", "expression": str(data.get("text", _plain_rich_text(text)))}
    if kind == "anchor":
        return {"type": "anchor", "name": str(data.get("text", _plain_rich_text(text)))}
    if kind == "list":
        items = data.get("items", [])
        if not isinstance(items, list) or not items:
            raise RichMessageRenderError(f"{path}: the list has no items")
        payload_items = []
        for item_index, item in enumerate(items):
            if isinstance(item, dict) and isinstance(item.get("blocks"), list):
                item_blocks = [
                    _editor_input_block(child, f"{path}.items[{item_index}].blocks[{child_index}]")
                    for child_index, child in enumerate(item["blocks"])
                ]
                payload_items.append({
                    "blocks": item_blocks,
                    "has_checkbox": item.get("has_checkbox"), "is_checked": item.get("is_checked"),
                    "value": item.get("value"), "type": item.get("type"),
                })
            else:
                payload_items.append({"blocks": [{"type": "paragraph", "text": str(item)}]})
        return {"type": "list", "items": payload_items}
    if kind == "table":
        rows = data.get("rows", [])
        if not rows or not all(isinstance(row, list) and row for row in rows):
            raise RichMessageRenderError(f"{path}: the table has no cells")
        cells = []
        for row in rows:
            payload_row = []
            for cell in row:
                source = cell if isinstance(cell, dict) else {"text": str(cell)}
                payload_row.append({
                    "text": inline_button_rich_text(source.get("text", "")),
                    "align": source.get("align") or "left",
                    "valign": source.get("valign") or "middle", "is_header": source.get("is_header"),
                    "colspan": source.get("colspan"), "rowspan": source.get("rowspan"),
                })
            cells.append(payload_row)
        return {
            "type": "table", "cells": cells,
            "is_bordered": data.get("is_bordered", True), "is_striped": data.get("is_striped"),
            "caption": _data_rich_text(data, "caption_rich_text", "caption_html", "caption_text") or None,
        }
    if kind in {"blockquote", "pullquote"}:
        quote = _data_rich_text(data, "quote_rich_text", "quote_html", "quote_text")
        credit = _data_rich_text(data, "credit_rich_text", "credit_html", "credit_text") or None
        if kind == "pullquote":
            return {"type": "pullquote", "text": quote or "", "credit": credit}
        return {"type": "blockquote", "blocks": [{"type": "paragraph", "text": quote or ""}], "credit": credit}
    if kind in {"details", "collage", "slideshow"}:
        children = data.get("children", [])
        if not isinstance(children, list) or not children:
            raise RichMessageRenderError(f"{path}: the container has no blocks")
        nested_blocks: list[dict[str, Any]] = []
        for index, child in enumerate(sorted(children, key=lambda item: item.get("position", 0))):
            nested_blocks.extend(_editor_input_blocks(child, f"{path}.blocks[{index}]"))
        payload = {
            "type": kind,
            "blocks": nested_blocks,
        }
        if kind == "details":
            payload["summary"] = _data_rich_text(data, "summary_rich_text", "summary_html", "summary_text") or tr("تفاصيل")
            payload["is_open"] = data.get("is_open")
        else:
            payload["caption"] = _caption_payload(data)
        return payload
    if kind == "map":
        if data.get("latitude") is None or data.get("longitude") is None:
            raise RichMessageRenderError(f"{path}: map latitude or longitude is missing")
        return {
            "type": "map", "location": {"latitude": float(data["latitude"]), "longitude": float(data["longitude"])},
            "zoom": int(data.get("zoom", 15)), "width": int(data.get("width", 600)),
            "height": int(data.get("height", 400)), "caption": _caption_payload(data),
        }
    if kind in RICH_MEDIA:
        file_id = _file_id(block)
        if not file_id:
            raise RichMessageRenderError(f"{path}: reusable media file_id is missing")
        api_kind = "voice_note" if kind == "voice" else kind
        return {"type": api_kind, api_kind: _input_media(block, file_id), "caption": _caption_payload(data)}
    raise RichMessageRenderError(f"{path}: unsupported rich block type")


def _editor_input_blocks(block: dict[str, Any], path: str) -> list[dict[str, Any]]:
    """Return one API block, converting media pullquotes to block quotations."""
    if block.get("type") not in {"blockquote", "pullquote"}:
        return [_editor_input_block(block, path)]
    data = block.get("data", {})
    attachments = data.get("media_children") or []
    if not attachments:
        return [_editor_input_block(block, path)]

    nested: list[dict[str, Any]] = []
    for index, child in enumerate(attachments):
        nested.extend(_editor_input_blocks(child, f"{path}.blocks[{index}]"))
    quote = _data_rich_text(data, "quote_rich_text", "quote_html", "quote_text")
    if quote not in (None, "", []):
        nested.append({"type": "paragraph", "text": quote})
    credit = _data_rich_text(
        data, "credit_rich_text", "credit_html", "credit_text",
    ) or None
    return [{"type": "blockquote", "blocks": nested, "credit": credit}]


def _rich_button_payload(button: dict[str, Any]) -> dict[str, Any]:
    button_type = str(button.get("type", "url"))
    value = str(button.get("value", button.get("url", "")))
    style = str(button.get("style", "default"))
    payload: dict[str, Any] = {"text": str(button.get("text") or "زر")}
    if style in {"primary", "success", "danger"}:
        payload["style"] = style
    elif style == "link" and button_type == "popup":
        payload["style"] = "link"

    if button_type == "copy":
        payload["copy_text"] = CopyTextButton(text=value)
    elif button_type == "callback_data":
        payload["callback_data"] = value
    elif button_type == "popup":
        payload["callback_data"] = f"r:popup:{button.get('popup_token') or button['id']}"
    elif button_type == "web_app":
        payload["web_app"] = {"url": value}
    elif button_type == "login_url":
        payload["login_url"] = {"url": value}
    elif button_type == "switch_inline":
        payload["switch_inline_query"] = value
    elif button_type == "switch_inline_current":
        payload["switch_inline_query_current_chat"] = value
    elif button_type == "disabled":
        payload["disabled"] = DisabledButton()
    else:
        payload["url"] = value or "https://t.me"
    return payload


def _button_blocks(
    buttons: list[dict[str, Any]] | None,
    buttons_per_row: int,
    align: str,
) -> list[dict[str, Any]]:
    if not buttons:
        return []
    ordered = sorted(buttons, key=lambda item: int(item.get("position", 0)))
    width = max(1, min(8, int(buttons_per_row)))
    safe_align = align if align in {"left", "center", "right"} else "center"
    return [
        {
            "type": "buttons",
            "buttons": [_rich_button_payload(item) for item in ordered[index:index + width]],
            "align": safe_align,
        }
        for index in range(0, len(ordered), width)
    ]


def _typed_input_rich_message(
    blocks: list[dict[str, Any]],
    buttons: list[dict[str, Any]] | None = None,
    buttons_per_row: int = 1,
    buttons_align: str = "center",
) -> InputRichMessage:
    if not blocks:
        raise RichMessageRenderError("The rich message has no blocks")
    payloads: list[dict[str, Any]] = []
    for index, block in enumerate(sorted(blocks, key=lambda item: item.get("position", 0))):
        kind = block.get("type", "unknown")
        path = f"blocks[{index}]<{kind}>"
        try:
            payloads.extend(_editor_input_blocks(block, path))
        except RichMessageRenderError:
            raise
        except Exception as error:
            raise RichMessageRenderError(f"{path}: {error}") from error
    try:
        # Direction is intentionally omitted. Telegram will render Arabic text
        # as RTL and Latin text as LTR instead of forcing every message to RTL.
        payloads.extend(_button_blocks(buttons, buttons_per_row, buttons_align))
        return InputRichMessage(blocks=payloads)
    except ValidationError as error:
        first = error.errors()[0] if error.errors() else {}
        location = ".".join(str(part) for part in first.get("loc", ()))
        detail = first.get("msg", str(error))
        raise RichMessageRenderError(f"Invalid rich block payload at {location}: {detail}") from error


def _render_rich_blocks(
    blocks: list[dict[str, Any]],
    fragments: list[str],
    media: list[InputRichMessageMedia],
    path: str = "root",
) -> None:
    for index, block in enumerate(sorted(blocks, key=lambda item: item["position"])):
        kind, data = block["type"], block.get("data", {})
        block_path = f"{path}[{index}]<{kind}>"
        if kind == "details" and data.get("children") is not None:
            nested_fragments: list[str] = []
            _render_rich_blocks(data["children"], nested_fragments, media, block_path)
            summary = data.get("summary_html") or tr("تفاصيل")
            fragments.append(
                f"<details><summary>{summary}</summary>"
                f"{''.join(nested_fragments)}</details>"
            )
            continue
        if kind in {"collage", "slideshow"} and data.get("children") is not None:
            nested_fragments: list[str] = []
            _render_rich_blocks(data["children"], nested_fragments, media, block_path)
            tag = "tg-collage" if kind == "collage" else "tg-slideshow"
            fragments.append(_with_caption(f"<{tag}>{''.join(nested_fragments)}</{tag}>", data))
            continue
        if kind in {"blockquote", "pullquote"}:
            quote = data.get("quote_html") or data.get("html") or ""
            credit = data.get("credit_html")
            if kind in {"blockquote", "pullquote"} and data.get("media_children"):
                nested_fragments: list[str] = []
                _render_rich_blocks(
                    data["media_children"], nested_fragments, media, f"{block_path}.blocks",
                )
                fragments.append(
                    f"<blockquote>{''.join(nested_fragments)}{quote}"
                    f"{f'<cite>{credit}</cite>' if credit else ''}</blockquote>"
                )
            else:
                tag = "blockquote" if kind == "blockquote" else "aside"
                fragments.append(f"<{tag}>{quote}{f'<cite>{credit}</cite>' if credit else ''}</{tag}>")
            continue
        if kind == "map":
            if data.get("latitude") is None or data.get("longitude") is None:
                raise RichMessageRenderError(
                    f"{block_path}: map latitude or longitude is missing"
                )
            map_html = (
                f'<tg-map lat="{data["latitude"]}" long="{data["longitude"]}" '
                f'zoom="{data.get("zoom", 15)}" width="{data.get("width", 600)}" '
                f'height="{data.get("height", 400)}"/>'
            )
            fragments.append(_with_caption(map_html, data))
            continue
        if kind in HTML_BLOCKS or kind == "details":
            rendered = data.get("html") or html.escape(data.get("text", ""))
            fragments.append(rendered if rendered.lstrip().startswith("<") else f"<p>{rendered}</p>")
            continue
        if kind not in RICH_MEDIA:
            raise RichMessageRenderError(
                f"{block_path}: unsupported rich block type"
            )
        file_id = _file_id(block)
        if not file_id:
            raise RichMessageRenderError(
                f"{block_path}: reusable media file_id is missing"
            )
        media_id = f"m_{block['id']}"
        media.append(InputRichMessageMedia(id=media_id, media=_input_media(block, file_id)))
        tag = "img" if kind == "photo" else "audio" if kind in {"audio", "voice"} else "tg-document" if kind == "document" else "video"
        link_type = "photo" if kind == "photo" else "audio" if kind in {"audio", "voice"} else "document" if kind == "document" else "video"
        close = "" if tag == "img" else f"</{tag}>"
        media_html = f'<{tag} src="tg://{link_type}?id={media_id}"/>' if tag == "img" else f'<{tag} src="tg://{link_type}?id={media_id}">{close}'
        fragments.append(_with_caption(media_html, data))


def build_input_rich_message(
    blocks: list[dict[str, Any]],
    buttons: list[dict[str, Any]] | None = None,
    *,
    buttons_per_row: int = 1,
    buttons_align: str = "center",
) -> InputRichMessage:
    return _typed_input_rich_message(blocks, buttons, buttons_per_row, buttons_align)


async def send_rich_message_post(
    bot: Bot,
    chat_id: int,
    blocks: list[dict[str, Any]],
    buttons: list[dict[str, Any]] | None = None,
    buttons_per_row: int = 1,
    buttons_align: str = "center",
    reply_markup: InlineKeyboardMarkup | None = None,
    *,
    disable_notification: bool = False,
    protect_content: bool = False,
):
    rich = build_input_rich_message(
        blocks, buttons, buttons_per_row=buttons_per_row, buttons_align=buttons_align,
    )
    with preserve_user_content():
        try:
            return await bot.send_rich_message(
                chat_id=chat_id,
                rich_message=rich,
                reply_markup=reply_markup,
                disable_notification=disable_notification,
                protect_content=protect_content,
            )
        except TelegramBadRequest as error:
            raise RichMessageRenderError(str(error)) from error


async def send_rich_message_preview(
    bot: Bot,
    chat_id: int,
    blocks: list[dict[str, Any]],
    buttons: list[dict[str, Any]] | None = None,
    buttons_per_row: int = 1,
    buttons_align: str = "center",
    reply_markup: InlineKeyboardMarkup | None = None,
) -> list:
    rich = build_input_rich_message(
        blocks, buttons, buttons_per_row=buttons_per_row, buttons_align=buttons_align,
    )
    with preserve_user_content():
        try:
            await bot.send_rich_message_draft(
                chat_id=chat_id,
                draft_id=secrets.randbelow(2_147_483_647) + 1,
                rich_message=InputRichMessage(
                    html=f"<tg-thinking>{tr('جاري إنشاء النتيجة…')}</tg-thinking>",
                ),
            )
            # Give Telegram clients enough time to render the animated draft.
            await asyncio.sleep(0.8)
        except Exception as error:
            # A draft is only visual feedback; it must never block the result.
            logger.warning("Thinking draft failed; continuing with final preview: %s", error)
        try:
            sent = await bot.send_rich_message(
                chat_id=chat_id, rich_message=rich, reply_markup=reply_markup,
            )
            return [sent]
        except TelegramBadRequest as error:
            raise RichMessageRenderError(str(error)) from error

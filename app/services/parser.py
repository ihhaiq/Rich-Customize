from __future__ import annotations

import html
import re
from typing import Any, Iterable

from aiogram.types import Message

from app.editor.models import (
    SOURCE_IMPORTED,
    SOURCE_NATIVE,
    make_block,
    normalize_block,
    normalize_blocks,
)
from app.i18n import tr
from app.services.media import media_store, native_file_data


TEXT_NATIVE_TYPES = {"paragraph"}
BLOCKQUOTE_HTML_RE = re.compile(
    r"<blockquote(?:\s+[^>]*)?>(.*?)</blockquote>",
    flags=re.IGNORECASE | re.DOTALL,
)


def _new_block(
    block_type: str,
    position: int,
    data: dict[str, Any],
    *,
    source: str = SOURCE_IMPORTED,
) -> dict[str, Any]:
    return make_block(block_type, data, position=position, source=source)


def _dump_entities(entities: Iterable[Any] | None) -> list[dict[str, Any]]:
    return [entity.model_dump(mode="json", exclude_none=True) for entity in entities or []]


def _plain_from_html(value: str) -> str:
    with_breaks = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    return html.unescape(re.sub(r"<[^>]+>", "", with_breaks))


def _formatted_message_text_blocks(message: Message, start_position: int) -> list[dict[str, Any]]:
    formatted = message.html_text
    matches = list(BLOCKQUOTE_HTML_RE.finditer(formatted))
    if not matches:
        return [_new_block("text", start_position, {
            "text": message.text or "",
            "html": formatted,
            "entities": _dump_entities(message.entities),
        })]

    blocks: list[dict[str, Any]] = []

    def append_text(fragment: str) -> None:
        cleaned = fragment.strip("\n")
        if not cleaned.strip():
            return
        blocks.append(_new_block("text", start_position + len(blocks), {
            "text": _plain_from_html(cleaned),
            "html": cleaned,
            "entities": [],
        }))

    cursor = 0
    for match in matches:
        append_text(formatted[cursor:match.start()])
        quote_html = match.group(1).strip("\n")
        if quote_html.strip():
            blocks.append(_new_block("blockquote", start_position + len(blocks), {
                "quote_text": _plain_from_html(quote_html),
                "quote_html": quote_html,
                "credit_html": None,
            }))
        cursor = match.end()
    append_text(formatted[cursor:])
    return blocks


def _rich_text_to_html(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return html.escape(value)
    if isinstance(value, list):
        return "".join(_rich_text_to_html(item) for item in value)
    if not isinstance(value, dict):
        return html.escape(str(value))
    kind = str(value.get("type", "plain"))
    inner = _rich_text_to_html(value.get("text", value.get("children", "")))
    wrappers = {
        "bold": "b", "italic": "i", "underline": "u", "strikethrough": "s",
        "spoiler": "tg-spoiler", "code": "code", "marked": "mark",
        "subscript": "sub", "superscript": "sup",
    }
    if kind in wrappers:
        tag = wrappers[kind]
        return f"<{tag}>{inner}</{tag}>"
    if kind in {"url", "anchor_link", "reference_link"}:
        url = html.escape(str(value.get("url", value.get("href", ""))), quote=True)
        return f'<a href="{url}">{inner}</a>'
    if kind == "text_mention" and value.get("user", {}).get("id"):
        return f'<a href="tg://user?id={value["user"]["id"]}">{inner}</a>'
    if kind == "custom_emoji" and value.get("custom_emoji_id"):
        return f'<tg-emoji emoji-id="{value["custom_emoji_id"]}">{inner}</tg-emoji>'
    if "text" in value and isinstance(value["text"], str):
        return html.escape(value["text"])
    return inner


def _native_html(block: dict[str, Any]) -> str:
    kind = str(block.get("type", ""))
    text = _rich_text_to_html(block.get("text"))
    if kind == "paragraph":
        return f"<p>{text}</p>"
    if kind in {"heading", "section_heading"}:
        level = max(1, min(6, int(block.get("size", block.get("level", 2)))))
        return f"<h{level}>{text}</h{level}>"
    if kind == "preformatted":
        return f"<pre>{text}</pre>"
    if kind == "footer":
        return f"<footer>{text}</footer>"
    if kind == "divider":
        return "<hr/>"
    if kind in {"blockquote", "block_quotation"}:
        nested = "".join(_native_html(item) for item in block.get("blocks", []))
        credit = _rich_text_to_html(block.get("credit"))
        return f"<blockquote>{nested}{f'<cite>{credit}</cite>' if credit else ''}</blockquote>"
    if kind in {"pullquote", "pull_quotation"}:
        credit = _rich_text_to_html(block.get("credit"))
        return f"<aside>{text}{f'<cite>{credit}</cite>' if credit else ''}</aside>"
    if kind == "mathematical_expression":
        expression = html.escape(str(block.get("expression", "")))
        return f"<tg-math-block>{expression}</tg-math-block>"
    if kind == "anchor":
        return f'<a name="{html.escape(str(block.get("name", "")), quote=True)}"></a>'
    if kind == "list":
        items_html: list[str] = []
        ordered = False
        for item in block.get("items", []):
            item_blocks = "".join(_native_html(child) for child in item.get("blocks", []))
            checked = ""
            if item.get("has_checkbox"):
                checked = "☑ " if item.get("is_checked") else "☐ "
            if item.get("value") is not None:
                ordered = True
            items_html.append(f"<li>{checked}{item_blocks}</li>")
        tag = "ol" if ordered else "ul"
        return f"<{tag}>{''.join(items_html)}</{tag}>"
    if kind == "table":
        rows_html: list[str] = []
        for row in block.get("cells", []):
            cells_html: list[str] = []
            for cell in row:
                tag = "th" if cell.get("is_header") else "td"
                attrs: list[str] = []
                for key in ("colspan", "rowspan", "align", "valign"):
                    if cell.get(key) is not None:
                        attrs.append(f'{key}="{html.escape(str(cell[key]), quote=True)}"')
                value = _rich_text_to_html(cell.get("text"))
                cells_html.append(f"<{tag}{' ' + ' '.join(attrs) if attrs else ''}>{value}</{tag}>")
            rows_html.append(f"<tr>{''.join(cells_html)}</tr>")
        flags = " bordered" if block.get("is_bordered") else ""
        flags += " striped" if block.get("is_striped") else ""
        caption = _rich_text_to_html(block.get("caption"))
        return f"<table{flags}>{f'<caption>{caption}</caption>' if caption else ''}{''.join(rows_html)}</table>"
    if kind == "details":
        summary = _rich_text_to_html(block.get("summary", block.get("title")))
        nested = "".join(_native_html(item) for item in block.get("blocks", []))
        return f"<details><summary>{summary}</summary>{nested}</details>"
    return text


def _native_type(kind: str) -> str:
    if kind in TEXT_NATIVE_TYPES:
        return "text"
    return {
        "voice_note": "voice",
        "section_heading": "heading",
        "block_quotation": "blockquote",
        "pull_quotation": "pullquote",
    }.get(kind, kind)


def _caption_parts(raw: dict[str, Any]) -> tuple[str | None, str | None]:
    caption = raw.get("caption") or {}
    if not isinstance(caption, dict):
        return None, None
    return (
        _rich_text_to_html(caption.get("text")) or None,
        _rich_text_to_html(caption.get("credit")) or None,
    )


def _native_raw_to_block(raw: dict[str, Any], position: int) -> dict[str, Any]:
    raw_type = str(raw.get("type", "content"))
    block_type = _native_type(raw_type)
    caption_html, credit_html = _caption_parts(raw)
    data: dict[str, Any] = {
        "native_type": raw_type,
        "native_data": raw,
        "html": _native_html(raw),
        "caption_html": caption_html,
        "credit_html": credit_html,
    }
    media_file = native_file_data(raw, block_type)
    if media_file is not None:
        data["file"] = media_file
    if block_type == "details":
        data["summary_html"] = (
            _rich_text_to_html(raw.get("summary", raw.get("title"))) or tr("تفاصيل")
        )
        data["children"] = [
            _native_raw_to_block(item, index)
            for index, item in enumerate(raw.get("blocks", []))
        ]
    elif block_type in {"collage", "slideshow"}:
        data["children"] = [
            _native_raw_to_block(item, index)
            for index, item in enumerate(raw.get("blocks", []))
        ]
    elif block_type == "blockquote":
        data["quote_html"] = "".join(_native_html(item) for item in raw.get("blocks", []))
        data["credit_html"] = _rich_text_to_html(raw.get("credit")) or None
    elif block_type == "pullquote":
        data["quote_html"] = _rich_text_to_html(raw.get("text"))
        data["credit_html"] = _rich_text_to_html(raw.get("credit")) or None
    elif block_type == "map":
        location = raw.get("location", {})
        data.update(
            latitude=location.get("latitude"),
            longitude=location.get("longitude"),
            zoom=raw.get("zoom", 15),
            width=raw.get("width", 600),
            height=raw.get("height", 400),
        )
    return _new_block(block_type, position, data, source=SOURCE_NATIVE)


def _parse_native_rich(message: Message) -> list[dict[str, Any]]:
    return [
        _native_raw_to_block(
            native.model_dump(mode="json", exclude_none=True),
            position,
        )
        for position, native in enumerate(message.rich_message.blocks)
    ]


def _remember(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for block in blocks:
        normalize_block(block)
    media_store.remember_blocks(blocks)
    return blocks


def message_to_blocks(message: Message, start_position: int = 0) -> list[dict[str, Any]]:
    if message.rich_message:
        blocks = _parse_native_rich(message)
        for block in blocks:
            block["position"] += start_position
        return _remember(blocks)

    blocks: list[dict[str, Any]] = []
    position = start_position
    if message.text is not None:
        return _remember(_formatted_message_text_blocks(message, position))

    media_type = None
    file_obj = None
    if message.photo:
        media_type, file_obj = "photo", message.photo[-1]
    else:
        for name in (
            "video", "animation", "audio", "voice",
            "document", "sticker", "video_note",
        ):
            value = getattr(message, name, None)
            if value is not None:
                media_type, file_obj = name, value
                break
    if media_type and file_obj:
        file_data = file_obj.model_dump(mode="json", exclude_none=True)
        file_data["file_id"] = file_obj.file_id
        blocks.append(_new_block(media_type, position, {
            "file": file_data,
            "has_spoiler": bool(message.has_media_spoiler),
        }))
        position += 1
    if message.caption:
        blocks.append(_new_block("caption", position, {
            "text": message.caption,
            "html": message.html_text,
            "entities": _dump_entities(message.caption_entities),
        }))
    return _remember(blocks)


def messages_to_blocks(messages: list[Message]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for message in sorted(messages, key=lambda item: item.message_id):
        blocks.extend(message_to_blocks(message, len(blocks)))
    normalize_blocks(blocks)
    return _remember(blocks)


def replacement_block(message: Message, block_type: str) -> dict[str, Any] | None:
    parsed = message_to_blocks(message)
    wanted = "text" if block_type in {"text", "caption", "quote"} else block_type
    return next((item for item in parsed if item["type"] == wanted), None)


def replacement_data(message: Message, block_type: str) -> dict[str, Any] | None:
    replacement = replacement_block(message, block_type)
    if replacement is None:
        return None
    data = replacement["data"]
    if block_type == "caption":
        data = {**data, "caption": True}
    return data


__all__ = [
    "message_to_blocks",
    "messages_to_blocks",
    "replacement_block",
    "replacement_data",
]

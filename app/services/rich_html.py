from __future__ import annotations

import html
from typing import Any


def _attrs(values: dict[str, Any]) -> str:
    return "".join(
        f' {key}="{html.escape(str(value), quote=True)}"'
        for key, value in values.items() if value is not None
    )


def _button_html(button: dict[str, Any]) -> str:
    attrs: dict[str, Any] = {"style": button.get("style")}
    for kind, attribute in (
        ("url", "url"), ("callback_data", "data"),
        ("switch_inline_query", "query"), ("switch_inline_query_current_chat", "query"),
        ("copy_text", "text"), ("web_app", "url"), ("login_url", "url"),
        ("switch_inline_query_chosen_chat", "query"), ("disabled", "disabled"),
    ):
        value = button.get(kind)
        if value is None:
            continue
        attrs["type"] = kind
        if isinstance(value, dict):
            for key, item in value.items():
                attrs[key.replace("_", "-")] = item
        else:
            attrs[attribute] = value
        break
    else:
        raise ValueError("Unsupported rich button")
    flags = ""
    for key in list(attrs):
        if isinstance(attrs[key], bool):
            if attrs.pop(key):
                flags += f" {key}"
    return f'<tg-button{_attrs(attrs)}{flags}>{rich_text_to_html(button.get("text"))}</tg-button>'


def rich_text_to_html(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return html.escape(value)
    if isinstance(value, list):
        return "".join(rich_text_to_html(item) for item in value)
    if not isinstance(value, dict):
        return html.escape(str(value))
    kind = str(value.get("type", "plain"))
    inner = rich_text_to_html(value.get("text", value.get("children", "")))
    wrappers = {
        "bold": "b", "italic": "i", "underline": "u", "strikethrough": "s",
        "spoiler": "tg-spoiler", "code": "code", "marked": "mark",
        "subscript": "sub", "superscript": "sup",
    }
    if kind in wrappers:
        tag = wrappers[kind]
        return f"<{tag}>{inner}</{tag}>"
    if kind == "button":
        return _button_html(value["button"])
    if kind in {"url", "anchor_link", "reference_link", "email_address", "phone_number"}:
        target = value.get("url", value.get("href", ""))
        for link_kind, field, prefix in (
            ("anchor_link", "anchor_name", "#"),
            ("reference_link", "reference_name", "#"),
            ("email_address", "email_address", "mailto:"),
            ("phone_number", "phone_number", "tel:"),
        ):
            if kind == link_kind:
                target = prefix + str(value.get(field, ""))
        url = html.escape(str(target), quote=True)
        return f'<a href="{url}">{inner}</a>'
    if kind == "text_mention" and value.get("user", {}).get("id"):
        return f'<a href="tg://user?id={value["user"]["id"]}">{inner}</a>'
    if kind == "custom_emoji" and value.get("custom_emoji_id"):
        alternative = rich_text_to_html(value.get("alternative_text", value.get("text", "")))
        return f'<tg-emoji{_attrs({"emoji-id": value["custom_emoji_id"]})}>{alternative}</tg-emoji>'
    if kind == "anchor":
        return f'<a{_attrs({"name": value["name"]})}></a>'
    if kind == "reference":
        return f'<tg-reference{_attrs({"name": value["name"]})}>{inner}</tg-reference>'
    if kind == "date_time":
        return f'<tg-time{_attrs({"unix": value["unix_time"], "format": value["date_time_format"]})}>{inner}</tg-time>'
    if kind == "mathematical_expression":
        return f'<tg-math>{html.escape(value["expression"])}</tg-math>'
    if "text" in value and isinstance(value["text"], str):
        return html.escape(value["text"])
    return inner


def rich_block_to_html(
    block: dict[str, Any], *, media: list[dict[str, Any]] | None = None,
) -> str:
    kind = str(block.get("type", ""))
    text = rich_text_to_html(block.get("text"))
    if kind == "paragraph":
        return f"<p>{text}</p>"
    if kind in {"heading", "section_heading"}:
        level = max(1, min(6, int(block.get("size", block.get("level", 2)))))
        return f"<h{level}>{text}</h{level}>"
    if kind in {"pre", "preformatted"}:
        if block.get("language"):
            text = f'<code{_attrs({"class": "language-" + block["language"]})}>{text}</code>'
        return f"<pre>{text}</pre>"
    if kind == "footer":
        return f"<footer>{text}</footer>"
    if kind == "divider":
        return "<hr/>"
    if kind in {"blockquote", "block_quotation", "expandable_blockquote"}:
        nested = "".join(rich_block_to_html(item, media=media) for item in block.get("blocks", []))
        if kind == "expandable_blockquote":
            nested = text
        credit = rich_text_to_html(block.get("credit"))
        flag = " expandable" if kind == "expandable_blockquote" else ""
        return f"<blockquote{flag}>{nested}{f'<cite>{credit}</cite>' if credit else ''}</blockquote>"
    if kind in {"pullquote", "pull_quotation"}:
        credit = rich_text_to_html(block.get("credit"))
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
            item_blocks = "".join(rich_block_to_html(child, media=media) for child in item.get("blocks", []))
            checked = ""
            if item.get("has_checkbox"):
                checked = '<input type="checkbox"' + (" checked" if item.get("is_checked") else "") + ">"
            if item.get("value") is not None:
                ordered = True
            item_attrs = _attrs({key: item.get(key) for key in ("value", "type")})
            items_html.append(f"<li{item_attrs}>{checked}{item_blocks}</li>")
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
                value = rich_text_to_html(cell.get("text"))
                cells_html.append(f"<{tag}{' ' + ' '.join(attrs) if attrs else ''}>{value}</{tag}>")
            rows_html.append(f"<tr>{''.join(cells_html)}</tr>")
        flags = " bordered" if block.get("is_bordered") else ""
        flags += " striped" if block.get("is_striped") else ""
        flags += " compact" if block.get("is_compact") else ""
        caption = rich_text_to_html(block.get("caption"))
        return f"<table{flags}>{f'<caption>{caption}</caption>' if caption else ''}{''.join(rows_html)}</table>"
    if kind == "details":
        summary = rich_text_to_html(block.get("summary", block.get("title")))
        nested = "".join(rich_block_to_html(item, media=media) for item in block.get("blocks", []))
        flag = " open" if block.get("is_open") else ""
        return f"<details{flag}><summary>{summary}</summary>{nested}</details>"
    if kind == "buttons":
        buttons = "".join(_button_html(button) for button in block.get("buttons", []))
        return f'<tg-button-row{_attrs({"align": block.get("align")})}>{buttons}</tg-button-row>'
    if kind == "thinking":
        return f"<tg-thinking>{text}</tg-thinking>"
    if kind in {"collage", "slideshow"}:
        nested = "".join(rich_block_to_html(child, media=media) for child in block.get("blocks", []))
        return f'<tg-{kind}>{nested}{_caption_html(block.get("caption"))}</tg-{kind}>'
    if kind == "map":
        location = block["location"]
        map_attrs = {"lat": location["latitude"], "long": location["longitude"]}
        map_attrs.update({key: block.get(key) for key in ("zoom", "width", "height")})
        return _figure(f"<tg-map{_attrs(map_attrs)}/>", block)
    if kind in {"photo", "video", "animation", "audio", "voice_note", "document"}:
        if media is None:
            # الاستيراد يحتفظ بالوسائط في native_data.
            return text
        source = block[kind]
        media_id = f"m_{len(media)}"
        media.append({"id": media_id, "media": source})
        link_kind = {"animation": "video", "voice_note": "audio"}.get(kind, kind)
        tag = {"photo": "img", "document": "tg-document"}.get(link_kind, link_kind)
        spoiler = " tg-spoiler" if source.get("has_spoiler") else ""
        opening = f'<{tag} src="tg://{link_kind}?id={media_id}"{spoiler}'
        rendered = opening + ("/>" if tag == "img" else f"></{tag}>")
        return _figure(rendered, block)
    if media is not None:
        raise ValueError(f"Unsupported rich block: {kind}")
    return text


def _caption_html(caption: dict[str, Any] | None) -> str:
    if not caption:
        return ""
    text = rich_text_to_html(caption.get("text"))
    credit = rich_text_to_html(caption.get("credit"))
    return f"<figcaption>{text}{f'<cite>{credit}</cite>' if credit else ''}</figcaption>"


def _figure(rendered: str, block: dict[str, Any]) -> str:
    caption = _caption_html(block.get("caption"))
    return f"<figure>{rendered}{caption}</figure>" if caption else rendered

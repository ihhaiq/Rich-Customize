from __future__ import annotations

import html
import re
from collections.abc import Iterable
from typing import Any

from aiogram.types import Message, MessageEntity
from aiogram.utils.text_decorations import html_decoration

from app.editor.models import make_block

CODE_LANGUAGE_RE = re.compile(r"^[A-Za-z0-9_+.#-]{1,32}$")
LIST_KINDS = {"bullet", "numbered", "checklist"}


def new_block(block_type: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    return make_block(block_type, data)


def _utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def _formatted_slice(
    plain: str,
    entities: Iterable[MessageEntity] | None,
    start: int,
    end: int,
) -> str:
    fragment = plain[start:end]
    if not fragment:
        return ""
    source_entities = list(entities or [])
    if not source_entities:
        return html.escape(fragment)

    start_units = _utf16_length(plain[:start])
    end_units = start_units + _utf16_length(fragment)
    clipped: list[MessageEntity] = []
    for entity in source_entities:
        entity_start = int(entity.offset)
        entity_end = entity_start + int(entity.length)
        overlap_start = max(entity_start, start_units)
        overlap_end = min(entity_end, end_units)
        if overlap_start >= overlap_end:
            continue
        clipped.append(
            entity.model_copy(
                update={
                    "offset": overlap_start - start_units,
                    "length": overlap_end - overlap_start,
                },
            ),
        )
    return html_decoration.unparse(fragment, clipped)


def _line_bounds(plain: str) -> list[tuple[int, int]]:
    bounds: list[tuple[int, int]] = []
    offset = 0
    for raw_line in plain.splitlines(keepends=True):
        content_end = offset + len(raw_line)
        while content_end > offset and plain[content_end - 1] in "\r\n":
            content_end -= 1
        bounds.append((offset, content_end))
        offset += len(raw_line)
    if plain and not bounds:
        bounds.append((0, len(plain)))
    return bounds


def _trim_bounds(plain: str, start: int, end: int) -> tuple[int, int]:
    while start < end and plain[start].isspace():
        start += 1
    while end > start and plain[end - 1].isspace():
        end -= 1
    return start, end


def _formatted_payload(
    plain: str,
    entities: Iterable[MessageEntity] | None,
    start: int,
    end: int,
) -> str | dict[str, Any]:
    text = plain[start:end]
    formatted = _formatted_slice(plain, entities, start, end)
    if formatted == html.escape(text):
        return text
    return {"text": text, "html": formatted}


def table_data(
    plain: str,
    entities: Iterable[MessageEntity] | None = None,
) -> dict[str, Any]:
    rows: list[list[Any]] = []
    for line_start, line_end in _line_bounds(plain):
        if not plain[line_start:line_end].strip():
            continue
        row: list[Any] = []
        cell_start = line_start
        for position in range(line_start, line_end + 1):
            if position != line_end and plain[position] != "|":
                continue
            start, end = _trim_bounds(plain, cell_start, position)
            row.append(_formatted_payload(plain, entities, start, end))
            cell_start = position + 1
        rows.append(row)

    widest_row = max((len(row) for row in rows), default=1)
    normalized_rows: list[list[Any]] = []
    for row in rows:
        if len(row) == 1 and widest_row > 1:
            source = row[0]
            if isinstance(source, dict):
                normalized_rows.append([{**source, "colspan": widest_row}])
            else:
                normalized_rows.append([{"text": source, "colspan": widest_row}])
        else:
            normalized_rows.append(row)

    html_rows: list[str] = []
    for row in normalized_rows:
        cells: list[str] = []
        for raw_cell in row:
            cell = raw_cell if isinstance(raw_cell, dict) else {"text": str(raw_cell)}
            colspan = cell.get("colspan")
            attribute = f' colspan="{int(colspan)}"' if colspan else ""
            cell_html = cell.get("html")
            if not isinstance(cell_html, str):
                cell_html = html.escape(str(cell.get("text", "")))
            cells.append(f"<td{attribute}>{cell_html}</td>")
        html_rows.append(f"<tr>{''.join(cells)}</tr>")
    return {
        "rows": normalized_rows,
        "text": plain,
        "html": f"<table bordered>{''.join(html_rows)}</table>",
    }


def preformatted_data(plain: str) -> dict[str, Any]:
    code = plain
    language: str | None = None
    lines = plain.splitlines()
    if lines and lines[0].startswith("```"):
        candidate = lines[0][3:].strip()
        if candidate and CODE_LANGUAGE_RE.fullmatch(candidate):
            language = candidate
        body = lines[1:]
        if body and body[-1].strip() == "```":
            body.pop()
        code = "\n".join(body)
    elif lines and lines[0].casefold().startswith("/lang "):
        candidate = lines[0][6:].strip()
        if CODE_LANGUAGE_RE.fullmatch(candidate):
            language = candidate
            code = "\n".join(lines[1:])

    escaped_code = html.escape(code)
    if language:
        escaped_language = html.escape(language, quote=True)
        rendered = f'<pre><code class="language-{escaped_language}">{escaped_code}</code></pre>'
    else:
        rendered = f"<pre>{escaped_code}</pre>"
    return {"text": code, "html": rendered, "language": language}


def list_data(
    plain: str,
    kind: str = "bullet",
    entities: Iterable[MessageEntity] | None = None,
) -> dict[str, Any]:
    safe_kind = kind if kind in LIST_KINDS else "bullet"
    items: list[dict[str, Any]] = []
    for line_start, line_end in _line_bounds(plain):
        start, end = _trim_bounds(plain, line_start, line_end)
        if start >= end:
            continue
        line = plain[start:end]
        checked = False
        content_start = start
        if safe_kind == "checklist":
            completed = re.match(r"^(?:\[\s*[xX]\s*\]|✅|☑️?)\s*", line)
            pending = re.match(r"^(?:\[\s*\]|⬜|☐)\s*", line)
            marker = completed or pending
            if marker:
                checked = completed is not None
                content_start += marker.end()
        elif safe_kind == "numbered":
            marker = re.match(r"^\d+\s*[.)-]\s*", line)
            if marker:
                content_start += marker.end()
        else:
            relative = 0
            while relative < len(line) and line[relative] in "-• ":
                relative += 1
            content_start += relative

        content_start, content_end = _trim_bounds(plain, content_start, end)
        if content_start >= content_end:
            continue
        item_text = plain[content_start:content_end]
        item: dict[str, Any] = {"text": item_text}
        formatted = _formatted_slice(plain, entities, content_start, content_end)
        if formatted != html.escape(item_text):
            item["html"] = formatted
        if safe_kind == "checklist":
            item.update(has_checkbox=True, is_checked=checked)
        elif safe_kind == "numbered":
            item.update(value=len(items) + 1, type="1")
        items.append(item)

    if safe_kind == "numbered":
        body = "".join(
            f"<li>{item.get('html') or html.escape(item['text'])}</li>"
            for item in items
        )
        rendered = f"<ol>{body}</ol>"
    elif safe_kind == "checklist":
        body = "".join(
            "<li><input type=\"checkbox\""
            f"{' checked' if item['is_checked'] else ''}>"
            f"{item.get('html') or html.escape(item['text'])}</li>"
            for item in items
        )
        rendered = f"<ul>{body}</ul>"
    else:
        body = "".join(
            f"<li>{item.get('html') or html.escape(item['text'])}</li>"
            for item in items
        )
        rendered = f"<ul>{body}</ul>"
    return {"items": items, "kind": safe_kind, "text": plain, "html": rendered}


def text_data(
    message: Message,
    block_type: str,
    heading_size: int = 2,
    list_kind: str = "bullet",
) -> dict[str, Any]:
    plain = message.text or ""
    rich = message.html_text
    if block_type in {"paragraph", "text"}:
        return {"text": plain, "html": f"<p>{rich}</p>"}
    if block_type == "heading":
        size = max(1, min(6, heading_size))
        return {"text": plain, "html": f"<h{size}>{rich}</h{size}>", "size": size}
    if block_type == "preformatted":
        return preformatted_data(plain)
    if block_type == "footer":
        return {"text": plain, "html": f"<footer>{rich}</footer>"}
    if block_type == "mathematical_expression":
        return {"text": plain, "html": f"<tg-math-block>{html.escape(plain)}</tg-math-block>"}
    if block_type == "anchor":
        name = "".join(
            ch for ch in plain.strip().replace(" ", "_")
            if ch.isalnum() or ch in "_-"
        )[:64]
        return {"text": name, "html": f'<a name="{html.escape(name, quote=True)}"></a>'}
    if block_type == "list":
        return list_data(plain, list_kind, message.entities)
    if block_type == "table":
        return table_data(plain, message.entities)
    return {"text": plain, "html": rich}


def quote_data(message: Message, credit_html: str | None = None) -> dict[str, Any]:
    return {
        "quote_text": message.text or "",
        "quote_html": message.html_text,
        "credit_html": credit_html,
    }


def details_data(summary_html: str, children: list[dict[str, Any]]) -> dict[str, Any]:
    return {"summary_html": summary_html, "children": children}


def container_data(children: list[dict[str, Any]]) -> dict[str, Any]:
    return {"children": children, "caption_html": None, "credit_html": None}


def map_data(latitude: float, longitude: float) -> dict[str, Any]:
    return {
        "latitude": latitude,
        "longitude": longitude,
        "zoom": 15,
        "width": 600,
        "height": 400,
        "caption_html": None,
        "credit_html": None,
    }

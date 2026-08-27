from __future__ import annotations

import html
import re
import uuid
from typing import Any

from aiogram.types import Message


FINAL_RICH_BLOCK_TYPES = (
    "paragraph", "heading", "preformatted", "footer", "divider",
    "mathematical_expression", "anchor", "list", "blockquote", "pullquote",
    "collage", "slideshow", "table", "details", "map", "animation",
    "audio", "document", "photo", "video", "voice",
)

MEDIA_CAPTION_TYPES = {
    "photo", "video", "animation", "audio", "voice", "document",
    "collage", "slideshow", "map",
}
QUOTE_TYPES = {"blockquote", "pullquote"}
CODE_LANGUAGE_RE = re.compile(r"^[A-Za-z0-9_+.#-]{1,32}$")
LIST_KINDS = {"bullet", "numbered", "checklist"}

# Only container blocks may expose the inner-block builder.  Keep the
# compatibility rules in the data layer so future containers can reuse the
# same UI without accidentally offering unsupported children.
CONTAINER_CHILD_BLOCK_TYPES: dict[str, tuple[str, ...]] = {
    "details": (
        "paragraph", "heading", "preformatted", "footer", "divider",
        "mathematical_expression", "anchor", "list", "blockquote", "pullquote",
        "table", "collage", "slideshow", "map", "animation", "audio",
        "document", "photo", "video", "voice",
    ),
    "collage": ("photo", "video"),
    "slideshow": ("photo", "video"),
}


def compatible_child_block_types(container_type: str) -> tuple[str, ...]:
    return CONTAINER_CHILD_BLOCK_TYPES.get(container_type, ())


def new_block(block_type: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:12],
        "type": block_type,
        "position": 0,
        "data": data or {},
    }


def table_data(plain: str) -> dict[str, Any]:
    rows: list[list[Any]] = [
        [cell.strip() for cell in line.split("|")]
        for line in plain.splitlines()
        if line.strip()
    ]
    widest_row = max((len(row) for row in rows), default=1)
    normalized_rows: list[list[Any]] = []
    for row in rows:
        if len(row) == 1 and widest_row > 1:
            normalized_rows.append([{
                "text": row[0],
                "colspan": widest_row,
            }])
        else:
            normalized_rows.append(row)

    html_rows: list[str] = []
    for row in normalized_rows:
        cells: list[str] = []
        for raw_cell in row:
            cell = raw_cell if isinstance(raw_cell, dict) else {"text": str(raw_cell)}
            colspan = cell.get("colspan")
            attribute = f' colspan="{int(colspan)}"' if colspan else ""
            cells.append(f"<td{attribute}>{html.escape(str(cell.get('text', '')))}</td>")
        html_rows.append(f"<tr>{''.join(cells)}</tr>")
    return {
        "rows": normalized_rows,
        "text": plain,
        "html": f"<table bordered>{''.join(html_rows)}</table>",
    }


def preformatted_data(plain: str) -> dict[str, Any]:
    """Parse an optional code language from /lang or a Markdown code fence."""
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


def list_data(plain: str, kind: str = "bullet") -> dict[str, Any]:
    """Build native rich-list items from the editor's line-based input."""
    safe_kind = kind if kind in LIST_KINDS else "bullet"
    items: list[dict[str, Any]] = []
    for raw_line in plain.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        checked = False
        if safe_kind == "checklist":
            completed = re.match(r"^(?:\[\s*[xX]\s*\]|✅|☑️?)\s*", line)
            pending = re.match(r"^(?:\[\s*\]|⬜|☐)\s*", line)
            marker = completed or pending
            if marker:
                checked = completed is not None
                line = line[marker.end():].strip()
        elif safe_kind == "numbered":
            line = re.sub(r"^\d+\s*[.)-]\s*", "", line).strip()
        else:
            line = line.lstrip("-• ").strip()
        if not line:
            continue
        item: dict[str, Any] = {"text": line}
        if safe_kind == "checklist":
            item.update(has_checkbox=True, is_checked=checked)
        elif safe_kind == "numbered":
            item.update(value=len(items) + 1, type="1")
        items.append(item)

    if safe_kind == "numbered":
        body = "".join(f"<li>{html.escape(item['text'])}</li>" for item in items)
        rendered = f"<ol>{body}</ol>"
    elif safe_kind == "checklist":
        body = "".join(
            "<li><input type=\"checkbox\""
            f"{' checked' if item['is_checked'] else ''}>"
            f"{html.escape(item['text'])}</li>"
            for item in items
        )
        rendered = f"<ul>{body}</ul>"
    else:
        body = "".join(f"<li>{html.escape(item['text'])}</li>" for item in items)
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
        name = "".join(ch for ch in plain.strip().replace(" ", "_") if ch.isalnum() or ch in "_-")[:64]
        return {"text": name, "html": f'<a name="{html.escape(name, quote=True)}"></a>'}
    if block_type == "list":
        return list_data(plain, list_kind)
    if block_type == "table":
        return table_data(plain)
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
        "latitude": latitude, "longitude": longitude,
        "zoom": 15, "width": 600, "height": 400,
        "caption_html": None, "credit_html": None,
    }

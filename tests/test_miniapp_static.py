from __future__ import annotations

import re
from pathlib import Path


STATIC = Path(__file__).parents[1] / "app" / "miniapp_static"


def test_inline_editor_does_not_use_deprecated_exec_command() -> None:
    sources = "\n".join(path.read_text("utf-8") for path in STATIC.glob("*.js"))
    assert "execCommand" not in sources


def test_i18n_loads_before_the_editor() -> None:
    html = (STATIC / "index.html").read_text("utf-8")
    assert html.index("miniapp_i18n.js") < html.index('/miniapp/static/app.js')


def test_referenced_translation_keys_are_declared() -> None:
    sources = "\n".join(path.read_text("utf-8") for path in STATIC.glob("*.js"))
    catalog = (STATIC / "miniapp_i18n.js").read_text("utf-8")
    referenced = set(re.findall(r"(?:mt|tr)\(\s*[\"']([^\"']+)[\"']", sources))
    declared = set(re.findall(r"[\"']([a-z][a-z0-9_.]+)[\"']\s*:", catalog))
    assert referenced <= declared


def test_requested_inline_formats_are_available() -> None:
    source = (STATIC / "inline_text_tools.js").read_text("utf-8")
    for name in {
        "bold", "italic", "strike", "underline", "code", "highlight",
        "subscript", "superscript", "spoiler",
    }:
        assert f'{name}:' in source
    assert 'tr("inline.link"' in source
    assert 'tr("inline.create_button"' in source


def test_media_picker_is_localized_and_uses_svg_icons() -> None:
    source = (STATIC / "media_upload.js").read_text("utf-8")
    assert not re.search(r"[\u0600-\u06ff]", source)
    assert "createMediaIcon" in source
    assert '<svg viewBox="0 0 24 24"' in source
    assert 'mt("media.picker_hint")' in source

from __future__ import annotations

import re
from pathlib import Path


STATIC = Path(__file__).parents[1] / "app" / "miniapp_static"


def test_inline_editor_does_not_use_deprecated_exec_command() -> None:
    sources = "\n".join(path.read_text("utf-8") for path in STATIC.glob("*.js"))
    assert "execCommand" not in sources


def test_i18n_loads_before_the_editor() -> None:
    html = (STATIC / "index.html").read_text("utf-8")
    assert html.index("miniapp_i18n_locales.js") < html.index("miniapp_i18n.js")
    assert html.index("miniapp_i18n.js") < html.index('/miniapp/static/app.js')
    assert html.index("miniapp_icons.js") < html.index('/miniapp/static/app.js')


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


def test_inline_link_editor_can_target_message_anchors() -> None:
    source = (STATIC / "inline_text_tools.js").read_text("utf-8")
    assert "function availableAnchors()" in source
    assert "data.display_name || name" in source
    assert "targetPicker?.value || normalizeLink(input.value)" in source
    assert r"/^#[^\s#]{1,64}$/u" in source


def test_russian_catalog_covers_referenced_interface_text() -> None:
    sources = "\n".join(
        path.read_text("utf-8")
        for path in STATIC.glob("*.js")
        if path.name != "miniapp_i18n.js"
    )
    catalog = (STATIC / "miniapp_i18n.js").read_text("utf-8")
    russian = catalog.split("    ru: {", 1)[1].split('    "zh-hans": {', 1)[0]
    referenced = set(re.findall(r"(?:mt|tr)\(\s*[\"']([^\"']+)[\"']", sources))
    russian_keys = set(re.findall(r'[\"\']([a-z][a-z0-9_.]+)[\"\']\s*:', russian))
    assert 'value.startsWith("ru")' in catalog
    assert referenced <= russian_keys


def test_miniapp_supports_every_bot_locale() -> None:
    expected = {
        "ar", "en", "es", "fr", "de", "it", "pt", "nl", "pl", "uk", "ru",
        "tr", "fa", "ku", "ur", "hi", "id", "ja", "ko", "vi", "th",
        "zh-hans", "zh-hant",
    }
    base = {"ar", "en", "ru", "zh-hans", "zh-hant"}
    extra = (STATIC / "miniapp_i18n_locales.js").read_text("utf-8")
    declared = set(re.findall(r"^    ([a-z]{2}):\[", extra, re.MULTILINE))
    assert base | declared == expected

    catalog = (STATIC / "miniapp_i18n.js").read_text("utf-8")
    assert "if (dictionaries[primary]) return primary" in catalog
    assert '["ar","fa","ur"].includes(language)' in catalog


def test_interface_controls_use_shared_svg_icons() -> None:
    html = (STATIC / "index.html").read_text("utf-8")
    icons = (STATIC / "miniapp_icons.js").read_text("utf-8")
    app = (STATIC / "app.js").read_text("utf-8")
    text_menu = (STATIC / "text_toolbar_menu.js").read_text("utf-8")
    assert "data-miniapp-icon=\"paragraph\"" in html
    assert "data-miniapp-icon=\"photo\"" in html
    assert "window.MiniAppIcons" in icons
    assert "MiniAppIcons.mount" in app
    assert "MiniAppIcons.mount" in text_menu
    assert "¶ Start writing" not in html
    assert "▧ Add photo" not in html


def test_media_picker_is_localized_and_uses_svg_icons() -> None:
    source = (STATIC / "media_upload.js").read_text("utf-8")
    assert not re.search(r"[\u0600-\u06ff]", source)
    assert "createMediaIcon" in source
    assert "MiniAppIcons.mount(icon, kind)" in source
    assert 'mt("media.picker_hint")' in source

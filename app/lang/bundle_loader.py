from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.lang.catalogs.asia import PROFILES as ASIA_PROFILES, TRANSLATIONS as ASIA_TRANSLATIONS
from app.lang.catalogs.catalog import CATALOG_AR, CATALOG_EN, CATALOG_TRANSLATIONS
from app.lang.catalogs.chinese import ZH_HANS, ZH_HANT
from app.lang.catalogs.common import AR_PHRASES as COMMON_AR_PHRASES
from app.lang.catalogs.common import KEY_TRANSLATIONS as COMMON_KEY_TRANSLATIONS
from app.lang.catalogs.common import PHRASES as COMMON_PHRASES
from app.lang.catalogs.common import UX_KEY_ALIASES
from app.lang.catalogs.details_semantic import DETAILS_AR_PHRASES, DETAILS_KEY_TRANSLATIONS, DETAILS_PHRASES
from app.lang.catalogs.editor_semantic import EDITOR_AR_PHRASES, EDITOR_KEY_TRANSLATIONS, EDITOR_PHRASES
from app.lang.catalogs.guide import GUIDE_TRANSLATIONS
from app.lang.catalogs.legacy_normalization import LEGACY_AR_TO_EN
from app.lang.catalogs.pages import PAGE_AR_TO_EN, PAGE_TRANSLATIONS
from app.lang.catalogs.recent_ui import RECENT_AR_TO_EN, RECENT_TRANSLATIONS
from app.lang.catalogs.regional import PROFILES as REGIONAL_PROFILES, TRANSLATIONS as REGIONAL_TRANSLATIONS
from app.lang.catalogs.ui_terms import ui_terms
from app.lang.catalogs.welcome_compact import (
    WELCOME_COMPACT_AR_PHRASES,
    WELCOME_COMPACT_KEY_TRANSLATIONS,
    WELCOME_COMPACT_PHRASES,
)
from app.lang.catalogs.welcome_revision import (
    WELCOME_REVISION_AR_PHRASES,
    WELCOME_REVISION_KEY_TRANSLATIONS,
    WELCOME_REVISION_PHRASES,
)
from app.lang.catalogs.welcome_semantic import (
    WELCOME_AR_PHRASES,
    WELCOME_KEY_TRANSLATIONS,
    WELCOME_PHRASES,
)
from app.lang.catalogs.western import PROFILES as WESTERN_PROFILES, TRANSLATIONS as WESTERN_TRANSLATIONS


@dataclass(frozen=True, slots=True)
class LocaleBundle:
    code: str
    phrases: dict[str, str]
    translations: dict[str, str]
    keyed: dict[str, str]
    catalog: dict[str, str]
    profile: dict[str, Any] | None = None


SOURCE_NORMALIZATION: dict[str, str] = {
    **PAGE_AR_TO_EN,
    **RECENT_AR_TO_EN,
    **LEGACY_AR_TO_EN,
}

_BASE_TRANSLATIONS: dict[str, dict[str, str]] = {
    **WESTERN_TRANSLATIONS,
    **REGIONAL_TRANSLATIONS,
    **ASIA_TRANSLATIONS,
    "zh-hans": ZH_HANS,
    "zh-hant": ZH_HANT,
}
_BASE_PROFILES: dict[str, dict[str, Any]] = {
    **WESTERN_PROFILES,
    **REGIONAL_PROFILES,
    **ASIA_PROFILES,
}


def _semantic_phrases(code: str) -> dict[str, str]:
    if code == "en":
        result = dict(EDITOR_PHRASES)
        result.update(DETAILS_PHRASES)
        result.update(COMMON_PHRASES)
        result.update(WELCOME_PHRASES)
        result.update(WELCOME_REVISION_PHRASES)
        result.update(WELCOME_COMPACT_PHRASES)
        return result
    if code == "ar":
        result = dict(EDITOR_AR_PHRASES)
        result.update(DETAILS_AR_PHRASES)
        result.update(COMMON_AR_PHRASES)
        result.update(WELCOME_AR_PHRASES)
        result.update(WELCOME_REVISION_AR_PHRASES)
        result.update(WELCOME_COMPACT_AR_PHRASES)
        return result
    return {}


def _source_translations(code: str) -> dict[str, str]:
    result = dict(_BASE_TRANSLATIONS.get(code, {}))
    for group in (GUIDE_TRANSLATIONS, PAGE_TRANSLATIONS, RECENT_TRANSLATIONS):
        result.update(group.get(code, {}))
    return result


def _localized_common(code: str, key: str) -> str:
    english = COMMON_PHRASES[key]
    if code == "en":
        return english
    if code == "ar":
        return COMMON_AR_PHRASES.get(key, english)
    keyed = COMMON_KEY_TRANSLATIONS.get(code, {})
    if key in keyed:
        return keyed[key]
    return _source_translations(code).get(english, english)


def _details_native_fallbacks(code: str) -> dict[str, str]:
    """Build concise native Details UI from already translated editor vocabulary.

    Details arrived after the original locale packs. Reusing established native
    labels here gives every supported locale deterministic coverage without
    silently dropping back to English, while dedicated wording can still
    override any key through DETAILS_KEY_TRANSLATIONS.
    """

    def common(key: str) -> str:
        return _localized_common(code, key)

    details = common("details")
    choose = common("common.choose_action")
    invalid = common("invalid")
    expired = common("expired")
    block_added = common("block_added")
    add_block = common("add_block")
    heading = common("block.heading")
    paragraph = common("block.paragraph")
    footer = common("block.footer")
    anchor = common("block.anchor")
    table = common("block.table")
    quote = common("block.blockquote")
    pullquote = common("block.pullquote")
    collage = common("block.collage")
    slideshow = common("block.slideshow")
    map_label = common("block.map")
    animation = common("block.animation")
    inner_credit = common("details.inner_credit")
    inner_count = common("details.inner_count")

    return {
        "details.builder_text": f"{details}\n\n{inner_count}\n{choose}",
        "details.added": block_added,
        "details.summary_prompt": f"{details} · {heading}",
        "details.summary_edit_prompt": f"{common('edit')} · {details} · {heading}",
        "details.summary_text_required": f"{details} · {heading} · {invalid}",
        "details.replace_content_prompt": f"{common('edit_content')} · {details}",
        "details.expired": expired,
        "details.choose_child": f"{details} · {add_block}",
        "details.cancelled": common("common.cancel"),
        "details.child_required": f"{details} · {add_block}",
        "details.invalid_child": invalid,
        "details.child_added": block_added,
        "details.choose_heading": f"{heading} · {choose}",
        "details.invalid_heading": invalid,
        "details.heading_selected": f"H{{level}} · {heading}",
        "details.send_paragraph": paragraph,
        "details.send_footer": footer,
        "details.send_anchor": f"{anchor} · {choose}",
        "details.send_table": table,
        "details.send_quote": quote,
        "details.send_pullquote": pullquote,
        "details.send_collage": collage,
        "details.send_slideshow": slideshow,
        "details.send_map": map_label,
        "details.send_animation": animation,
        "details.send_audio": common("send_audio"),
        "details.send_document": common("send_file"),
        "details.send_photo": common("send_photo"),
        "details.send_video": common("send_video"),
        "details.send_voice": common("send_voice"),
        "details.quote_content_required": quote,
        "details.quote_credit_prompt": inner_credit,
        "details.quote_text_after_media": quote,
        "details.quote_text_required": quote,
        "details.quote_credit_required": inner_credit,
        "details.wrong_child_content": invalid,
        "details.unsupported_content": common("unsupported"),
    }


def _ux_native_fallbacks(code: str) -> dict[str, str]:
    """Compose compact native copy for recent button-management controls."""

    if code in {"ar", "en"}:
        return {}

    terms = ui_terms(code)

    def common(key: str) -> str:
        return _localized_common(code, key)

    button = terms["button"]
    add_buttons = common("add_buttons")
    buttons = common("buttons_manage")
    change_title = common("change_title")
    change_content = common("change_content")
    choose = common("common.choose_action")
    delete = common("delete")
    invalid = common("invalid")
    pages = common("pages")
    if pages == COMMON_PHRASES["pages"]:
        pages = {"zh-hans": "📚 页面", "zh-hant": "📚 頁面"}.get(code, pages)
    retry = common("editor.redo_button")
    send = common("send_now")
    undo = common("editor.undo_button")

    return {
        "button_preview": f"👁 {terms['preview']} · {button}",
        "pages": pages,
        "preview_block": f"👁 {terms['preview']} · {common('block.content')}",
        "send_file": f"{terms['write']} · {common('block.document')}",
        "ux.editor.title": common("customize"),
        "ux.editor.buttons": f"{button}: {{count}}",
        "ux.editor.preview": f"👁 {terms['preview']}",
        "ux.buttons.title": buttons,
        "ux.buttons.count": f"{button}: {{count}}",
        "ux.buttons.empty": f"{button}: 0 · {add_buttons}",
        "ux.buttons.layout": f"{terms['row']} · {button}: {{count}}",
        "ux.buttons.summary": f"{button} {{position}} · {{title}} · {{type}} · {{style}}",
        "ux.buttons.edit_title": change_title,
        "ux.buttons.edit_value": change_content,
        "ux.buttons.edit_type": f"{common('edit')} · {choose}",
        "ux.buttons.delete_confirm": f"{delete} “{{title}}”?",
        "ux.buttons.deleted": delete,
        "ux.buttons.category.links": terms["link"],
        "ux.buttons.category.actions": choose,
        "ux.buttons.category.navigation": f"↔ {pages}",
        "ux.buttons.category.search": terms["search"],
        "ux.buttons.category.special": "★",
        "ux.buttons.type.url": f"🔗 {terms['link']}",
        "ux.buttons.type.callback": f"⚡ callback · {button}",
        "ux.buttons.type.copy": f"📋 {terms['copy']}",
        "ux.buttons.type.popup": f"💬 {terms['open']} · {button}",
        "ux.buttons.type.page": pages,
        "ux.buttons.type.inline": f"🔎 {terms['search']} · {button}",
        "ux.buttons.type.inline_here": f"💬 {terms['search']} · {terms['location']}",
        "ux.buttons.type.disabled": f"🚫 {terms['close']} · {button}",
        "ux.buttons.type.web_app": f"🌐 {terms['open']} · Web App",
        "ux.buttons.type.login_url": f"🔐 Login · {terms['link']}",
        "ux.buttons.style.default": "⚪",
        "ux.buttons.style.primary": "🔵",
        "ux.buttons.style.success": "🟢",
        "ux.buttons.style.danger": "🔴",
        "ux.buttons.style.link": "🔗",
        "ux.buttons.editing": f"{common('edit')} · {button}: {{title}}",
        "ux.buttons.current_type": f"{button}: {{type}}",
        "ux.buttons.step.title": f"{add_buttons} · 1/4\n\n{change_title}",
        "ux.buttons.step.type": f"{add_buttons} · 2/4\n\n{choose}",
        "ux.buttons.step.value": f"{add_buttons} · 3/4\n\n{{prompt}}",
        "ux.buttons.step.color": f"{add_buttons} · 4/4\n\n{common('color')}",
        "ux.buttons.added": f"{button} · {common('block_added')}",
        "ux.buttons.missing": f"{button} · {common('missing_block')}",
        "ux.buttons.send_new_title": change_title,
        "ux.buttons.send_new_value": change_content,
        "ux.publish.send": f"{send} · {{count}}",
        "ux.publish.confirm": f"{send} · {{count}}?",
        "ux.publish.confirm_yes": send,
        "ux.common.retry": retry,
        "ux.pages.restore": f"{undo} · {pages}",
        "ux.pages.deleted_recoverable": f"{delete} · {pages} · {undo}",
        "ux.pages.restored": f"{undo} · {pages}",
        "ux.pages.restore_unavailable": f"{pages} · {common('expired')}",
        "ux.errors.login_domain": f"{invalid} · @BotFather /setdomain",
        "ux.errors.button_data": f"{invalid} · callback_data",
        "ux.errors.invalid_url": f"{invalid} · HTTPS URL",
        "ux.errors.too_long": invalid,
        "ux.errors.telegram_rejected": f"{terms['error']}: {{reason}}",
    }


def _keyed(code: str) -> dict[str, str]:
    result = dict(EDITOR_KEY_TRANSLATIONS.get(code, {}))
    result.update(COMMON_KEY_TRANSLATIONS.get(code, {}))

    # ``pack()`` stores the original locale families by their English source
    # text.  Surface those translations through semantic keys as well so new
    # call sites do not lose mature locale coverage during the t()/tr()
    # migration.  Aliases intentionally use the same native wording as their
    # established action rather than depending on an English fallback.
    for key in COMMON_PHRASES:
        localized = _localized_common(code, key)
        if localized != COMMON_PHRASES[key]:
            result.setdefault(key, localized)
    for alias, source_key in UX_KEY_ALIASES.items():
        localized = _localized_common(code, source_key)
        if localized != COMMON_PHRASES[source_key]:
            result.setdefault(alias, localized)

    for key, localized in _ux_native_fallbacks(code).items():
        result.setdefault(key, localized)

    result.update(WELCOME_KEY_TRANSLATIONS.get(code, {}))
    result.update(WELCOME_REVISION_KEY_TRANSLATIONS.get(code, {}))
    result.update(WELCOME_COMPACT_KEY_TRANSLATIONS.get(code, {}))
    details = _details_native_fallbacks(code)
    details.update(DETAILS_KEY_TRANSLATIONS.get(code, {}))
    result.update(details)
    return result


def build_bundle(code: str) -> LocaleBundle:
    if code == "en":
        catalog = dict(CATALOG_EN)
    elif code == "ar":
        catalog = dict(CATALOG_AR)
    else:
        catalog = dict(CATALOG_TRANSLATIONS.get(code, {}))
    return LocaleBundle(
        code=code,
        phrases=_semantic_phrases(code),
        translations=_source_translations(code),
        keyed=_keyed(code),
        catalog=catalog,
        profile=dict(_BASE_PROFILES[code]) if code in _BASE_PROFILES else None,
    )


__all__ = ["LocaleBundle", "SOURCE_NORMALIZATION", "build_bundle"]

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.lang.catalogs.asia import PROFILES as ASIA_PROFILES, TRANSLATIONS as ASIA_TRANSLATIONS
from app.lang.catalogs.catalog import CATALOG_AR, CATALOG_EN, CATALOG_TRANSLATIONS
from app.lang.catalogs.chinese import ZH_HANS, ZH_HANT
from app.lang.catalogs.common import AR_PHRASES as COMMON_AR_PHRASES
from app.lang.catalogs.common import KEY_TRANSLATIONS as COMMON_KEY_TRANSLATIONS
from app.lang.catalogs.common import PHRASES as COMMON_PHRASES
from app.lang.catalogs.details_semantic import DETAILS_AR_PHRASES, DETAILS_KEY_TRANSLATIONS, DETAILS_PHRASES
from app.lang.catalogs.editor_semantic import EDITOR_AR_PHRASES, EDITOR_KEY_TRANSLATIONS, EDITOR_PHRASES
from app.lang.catalogs.guide import GUIDE_TRANSLATIONS
from app.lang.catalogs.pages import PAGE_AR_TO_EN, PAGE_TRANSLATIONS
from app.lang.catalogs.recent_ui import RECENT_AR_TO_EN, RECENT_TRANSLATIONS
from app.lang.catalogs.regional import PROFILES as REGIONAL_PROFILES, TRANSLATIONS as REGIONAL_TRANSLATIONS
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
        return result
    if code == "ar":
        result = dict(EDITOR_AR_PHRASES)
        result.update(DETAILS_AR_PHRASES)
        result.update(COMMON_AR_PHRASES)
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


def _keyed(code: str) -> dict[str, str]:
    result = dict(EDITOR_KEY_TRANSLATIONS.get(code, {}))
    result.update(COMMON_KEY_TRANSLATIONS.get(code, {}))
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

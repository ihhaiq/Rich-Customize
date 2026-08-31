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
        result = dict(COMMON_PHRASES)
        result.update(EDITOR_PHRASES)
        result.update(DETAILS_PHRASES)
        return result
    if code == "ar":
        result = dict(COMMON_AR_PHRASES)
        result.update(EDITOR_AR_PHRASES)
        result.update(DETAILS_AR_PHRASES)
        return result
    return {}


def _keyed(code: str) -> dict[str, str]:
    result = dict(COMMON_KEY_TRANSLATIONS.get(code, {}))
    result.update(EDITOR_KEY_TRANSLATIONS.get(code, {}))
    result.update(DETAILS_KEY_TRANSLATIONS.get(code, {}))
    return result


def _source_translations(code: str) -> dict[str, str]:
    result = dict(_BASE_TRANSLATIONS.get(code, {}))
    for group in (GUIDE_TRANSLATIONS, PAGE_TRANSLATIONS, RECENT_TRANSLATIONS):
        result.update(group.get(code, {}))
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

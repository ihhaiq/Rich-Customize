from __future__ import annotations

from app.locales.asia import PROFILES as ASIA_PROFILES, TRANSLATIONS as ASIA_TRANSLATIONS
from app.locales.regional import PROFILES as REGIONAL_PROFILES, TRANSLATIONS as REGIONAL_TRANSLATIONS
from app.locales.western import PROFILES as WESTERN_PROFILES, TRANSLATIONS as WESTERN_TRANSLATIONS
from app.translations_zh import ZH_HANS, ZH_HANT

TRANSLATIONS: dict[str, dict[str, str]] = {
    **WESTERN_TRANSLATIONS,
    **REGIONAL_TRANSLATIONS,
    **ASIA_TRANSLATIONS,
    "zh-hans": ZH_HANS,
    "zh-hant": ZH_HANT,
}

PROFILES = {
    **WESTERN_PROFILES,
    **REGIONAL_PROFILES,
    **ASIA_PROFILES,
}

SUPPORTED_LANGUAGES = frozenset({"ar", "en", "zh-hans", "zh-hant", *TRANSLATIONS.keys()})

__all__ = ["TRANSLATIONS", "PROFILES", "SUPPORTED_LANGUAGES"]

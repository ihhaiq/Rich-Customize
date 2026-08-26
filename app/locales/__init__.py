from __future__ import annotations

from app import i18n_core as _core
from app.locales.asia import PROFILES as ASIA_PROFILES, TRANSLATIONS as ASIA_TRANSLATIONS
from app.locales.guide import GUIDE_TRANSLATIONS
from app.locales.pages import PAGE_AR_TO_EN, PAGE_TRANSLATIONS
from app.locales.recent_ui import RECENT_AR_TO_EN, RECENT_TRANSLATIONS
from app.locales.regional import PROFILES as REGIONAL_PROFILES, TRANSLATIONS as REGIONAL_TRANSLATIONS
from app.locales.western import PROFILES as WESTERN_PROFILES, TRANSLATIONS as WESTERN_TRANSLATIONS
from app.translations_zh import ZH_HANS, ZH_HANT

# Register Arabic UI fragments before app.i18n snapshots _core.EN. This keeps
# every caller using the same Arabic -> English normalization table.
_core.EN.update(PAGE_AR_TO_EN)
_core.EN.update(RECENT_AR_TO_EN)

TRANSLATIONS: dict[str, dict[str, str]] = {
    **WESTERN_TRANSLATIONS,
    **REGIONAL_TRANSLATIONS,
    **ASIA_TRANSLATIONS,
    "zh-hans": ZH_HANS,
    "zh-hant": ZH_HANT,
}

for overrides_by_language in (GUIDE_TRANSLATIONS, PAGE_TRANSLATIONS, RECENT_TRANSLATIONS):
    for language_code, overrides in overrides_by_language.items():
        TRANSLATIONS.setdefault(language_code, {}).update(overrides)

PROFILES = {
    **WESTERN_PROFILES,
    **REGIONAL_PROFILES,
    **ASIA_PROFILES,
}

SUPPORTED_LANGUAGES = frozenset({"ar", "en", "zh-hans", "zh-hant", *TRANSLATIONS.keys()})

__all__ = ["TRANSLATIONS", "PROFILES", "SUPPORTED_LANGUAGES"]

from __future__ import annotations

from app import i18n_core as _core
from app.locales.asia import PROFILES as ASIA_PROFILES, TRANSLATIONS as ASIA_TRANSLATIONS
from app.locales.common import (
    AR_PHRASES as COMMON_AR_PHRASES,
    KEY_TRANSLATIONS as COMMON_KEY_TRANSLATIONS,
    PHRASES as COMMON_PHRASES,
)
from app.locales.details_semantic import (
    DETAILS_AR_PHRASES,
    DETAILS_KEY_TRANSLATIONS,
    DETAILS_PHRASES,
)
from app.locales.editor_semantic import (
    EDITOR_AR_PHRASES,
    EDITOR_KEY_TRANSLATIONS,
    EDITOR_PHRASES,
)
from app.locales.guide import GUIDE_TRANSLATIONS
from app.locales.pages import PAGE_AR_TO_EN, PAGE_TRANSLATIONS
from app.locales.recent_ui import RECENT_AR_TO_EN, RECENT_TRANSLATIONS
from app.locales.regional import PROFILES as REGIONAL_PROFILES, TRANSLATIONS as REGIONAL_TRANSLATIONS
from app.locales.western import PROFILES as WESTERN_PROFILES, TRANSLATIONS as WESTERN_TRANSLATIONS
from app.translations_zh import ZH_HANS, ZH_HANT

# Semantic editor copy is registered in the locale layer, never from routers.
# This is the single initialization point for prompt overrides.
for _phrases in (EDITOR_PHRASES, DETAILS_PHRASES):
    COMMON_PHRASES.update(_phrases)
for _phrases in (EDITOR_AR_PHRASES, DETAILS_AR_PHRASES):
    COMMON_AR_PHRASES.update(_phrases)
for _translation_group in (EDITOR_KEY_TRANSLATIONS, DETAILS_KEY_TRANSLATIONS):
    for _language_code, _overrides in _translation_group.items():
        COMMON_KEY_TRANSLATIONS.setdefault(_language_code, {}).update(_overrides)

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

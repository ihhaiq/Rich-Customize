from __future__ import annotations

from importlib import import_module
from typing import Any

from app.lang.bundle_loader import LocaleBundle
from app.lang.catalogs.migration_semantic import SEMANTIC_AR_PHRASES, SEMANTIC_PHRASES


LANGUAGE_MODULES: dict[str, str] = {
    "ar": "ar",
    "en": "en",
    "es": "es",
    "fr": "fr",
    "de": "de",
    "it": "it",
    "pt": "pt",
    "nl": "nl",
    "pl": "pl",
    "uk": "uk",
    "ru": "ru",
    "tr": "tr",
    "fa": "fa",
    "ku": "ku",
    "ur": "ur",
    "hi": "hi",
    "id": "id",
    "ja": "ja",
    "ko": "ko",
    "vi": "vi",
    "th": "th",
    "zh-hans": "zh_hans",
    "zh-hant": "zh_hant",
}


def _load_bundle(code: str, module_name: str) -> LocaleBundle:
    module = import_module(f"app.lang.{module_name}")
    bundle = getattr(module, "BUNDLE")
    if not isinstance(bundle, LocaleBundle) or bundle.code != code:
        raise RuntimeError(f"Invalid locale bundle for {code}: app.lang.{module_name}")
    return bundle


BUNDLES: dict[str, LocaleBundle] = {
    code: _load_bundle(code, module_name)
    for code, module_name in LANGUAGE_MODULES.items()
}

PHRASES = dict(BUNDLES["en"].phrases)
AR_PHRASES = dict(BUNDLES["ar"].phrases)
KEY_TRANSLATIONS: dict[str, dict[str, str]] = {
    code: dict(bundle.keyed)
    for code, bundle in BUNDLES.items()
    if code not in {"ar", "en"} and bundle.keyed
}
TRANSLATIONS: dict[str, dict[str, str]] = {
    code: dict(bundle.translations)
    for code, bundle in BUNDLES.items()
    if code != "en" and bundle.translations
}

# New UI is registered by semantic key. Reuse the established English-source
# translations when a locale already has them, otherwise fall back to English
# instead of reintroducing Arabic source-string normalization.
PHRASES.update(SEMANTIC_PHRASES)
AR_PHRASES.update(SEMANTIC_AR_PHRASES)
for code in LANGUAGE_MODULES:
    if code in {"ar", "en"}:
        continue
    keyed = KEY_TRANSLATIONS.setdefault(code, {})
    source_map = TRANSLATIONS.get(code, {})
    for key, english in SEMANTIC_PHRASES.items():
        keyed.setdefault(key, source_map.get(english, english))

CATALOG_EN = dict(BUNDLES["en"].catalog)
CATALOG_AR = dict(BUNDLES["ar"].catalog)
CATALOG_TRANSLATIONS: dict[str, dict[str, str]] = {
    code: dict(bundle.catalog)
    for code, bundle in BUNDLES.items()
    if code not in {"ar", "en"} and bundle.catalog
}
PROFILES: dict[str, dict[str, Any]] = {
    code: dict(bundle.profile)
    for code, bundle in BUNDLES.items()
    if bundle.profile is not None
}
SUPPORTED_LANGUAGES = frozenset(BUNDLES)


__all__ = [
    "AR_PHRASES",
    "BUNDLES",
    "CATALOG_AR",
    "CATALOG_EN",
    "CATALOG_TRANSLATIONS",
    "KEY_TRANSLATIONS",
    "LANGUAGE_MODULES",
    "PHRASES",
    "PROFILES",
    "SUPPORTED_LANGUAGES",
    "TRANSLATIONS",
]

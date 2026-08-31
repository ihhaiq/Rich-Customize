from __future__ import annotations

from typing import Any

from app import i18n_core as _core
from app.lang import (
    AR_PHRASES,
    CATALOG_AR,
    CATALOG_EN,
    CATALOG_TRANSLATIONS,
    KEY_TRANSLATIONS,
    PHRASES,
    TRANSLATIONS,
)

EN = _core.EN
EN.update({
    "👁 معاينة هذا الـBlock": "👁 Preview this Block",
    "جاري إنشاء معاينة الجزء…": "Generating block preview…",
    "تعذرت معاينة هذا الجزء.": "Couldn't preview this block.",
    "تعذرت معاينة هذا الجزء وحده.": "Couldn't preview this block by itself.",
    "📚 صفحاتي": "📚 My Pages",
})

preserve_user_content = _core.preserve_user_content
current_language = _core.current_language
LocalizedBot = _core.LocalizedBot
LocaleMiddleware = _core.LocaleMiddleware


def resolve_language(language_code: str | None) -> str:
    code = (language_code or "").strip().lower().replace("_", "-")
    if code.startswith("ar"):
        return "ar"
    if code.startswith("zh"):
        if any(marker in code for marker in ("hant", "tw", "hk", "mo")):
            return "zh-hant"
        return "zh-hans"
    primary = code.split("-", 1)[0]
    if primary == "en":
        return "en"
    if primary in TRANSLATIONS:
        return primary
    return "en"


def tr(text: str) -> str:
    """Translate historical source-text UI while semantic-key migration continues."""
    language = _core._language.get()
    if language == "ar":
        translated = text
        locale = TRANSLATIONS.get("ar")
        if locale:
            for source, target in sorted(locale.items(), key=lambda item: len(item[0]), reverse=True):
                translated = translated.replace(source, target)
        return translated

    translated = text
    for source, target in sorted(EN.items(), key=lambda item: len(item[0]), reverse=True):
        translated = translated.replace(source, target)
    locale = TRANSLATIONS.get(language)
    if locale:
        for source, target in sorted(locale.items(), key=lambda item: len(item[0]), reverse=True):
            translated = translated.replace(source, target)
    return translated


def t(key: str, **values: Any) -> str:
    """Translate one semantic UI key for the active Telegram locale."""
    is_catalog_key = key in CATALOG_EN
    if key not in PHRASES and not is_catalog_key:
        raise KeyError(f"Unknown i18n key: {key}")

    language = _core._language.get()
    if is_catalog_key:
        if language == "ar":
            text = CATALOG_AR.get(key, CATALOG_EN[key])
        elif language == "en":
            text = CATALOG_EN[key]
        else:
            text = CATALOG_TRANSLATIONS.get(language, {}).get(key, CATALOG_EN[key])
    elif language == "ar":
        text = AR_PHRASES.get(key, PHRASES[key])
    elif language == "en":
        text = PHRASES[key]
    else:
        keyed = KEY_TRANSLATIONS.get(language, {})
        if key in keyed:
            text = keyed[key]
        else:
            english = PHRASES[key]
            text = TRANSLATIONS.get(language, {}).get(english, english)

    return text.format(**values) if values else text


# i18n_core still owns the middleware/Bot implementation. Install the public
# resolver/translator hooks once here so old callers and new semantic callers
# observe one locale context.
_core.resolve_language = resolve_language
_core.tr = tr
_core.EN = EN


__all__ = [
    "EN",
    "LocaleMiddleware",
    "LocalizedBot",
    "current_language",
    "preserve_user_content",
    "resolve_language",
    "t",
    "tr",
]

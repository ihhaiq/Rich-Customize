from __future__ import annotations

import re
from contextlib import contextmanager
from typing import Any, Iterator

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
from app.lang.bundle_loader import SOURCE_NORMALIZATION
from app.lang.catalogs.ui_terms import ui_terms

EN = _core.EN
EN.update(SOURCE_NORMALIZATION)
EN.update({
    "👁 معاينة هذا الـBlock": "👁 Preview this Block",
    "جاري إنشاء معاينة الجزء…": "Generating block preview…",
    "تعذرت معاينة هذا الجزء.": "Couldn't preview this block.",
    "تعذرت معاينة هذا الجزء وحده.": "Couldn't preview this block by itself.",
    "📚 صفحاتي": "📚 My Pages",
    "⬆️ صعود": "⬆️ Up",
    "⬇️ تمرير": "⬇️ Scroll",
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


@contextmanager
def use_language(language_code: str | None) -> Iterator[str]:
    """Temporarily bind localization outside the aiogram middleware lifecycle."""
    language = resolve_language(language_code)
    token = _core._language.set(language)
    try:
        yield language
    finally:
        _core._language.reset(token)


def tr(text: str) -> str:
    """Translate historical source-text UI while semantic-key migration continues."""
    language = _core._language.get()
    if language == "ar":
        translated = text
        locale = TRANSLATIONS.get("ar")
        if locale:
            for source, target in sorted(
                locale.items(),
                key=lambda item: len(item[0]),
                reverse=True,
            ):
                translated = translated.replace(source, target)
        return translated

    translated = text
    normalized_from_arabic = False
    normalized_targets: list[str] = []
    for source, target in sorted(EN.items(), key=lambda item: len(item[0]), reverse=True):
        if source in translated:
            normalized_from_arabic = True
            normalized_targets.append(target)
        translated = translated.replace(source, target)
    english = translated
    locale = TRANSLATIONS.get(language)
    if locale:
        for source, target in sorted(
            locale.items(),
            key=lambda item: len(item[0]),
            reverse=True,
        ):
            translated = translated.replace(source, target)
    if language != "en" and normalized_from_arabic and translated == english:
        return _legacy_native_fallback(language, english, normalized_targets)
    return translated


def _legacy_native_fallback(
    language: str,
    english: str,
    normalized_targets: list[str],
) -> str:
    """Keep old Arabic-source flows usable until each call moves to t().

    Exact locale translations still win.  For a newly discovered legacy
    sentence, return a concise native intent instead of exposing Arabic or a
    silent English-only fallback.  Technical markers and format placeholders
    are retained so diagnostics and in-progress values remain actionable.
    """

    terms = ui_terms(language)
    lowered = english.casefold()

    def common(key: str) -> str:
        source = PHRASES[key]
        keyed = KEY_TRANSLATIONS.get(language, {})
        if key in keyed:
            return keyed[key]
        return TRANSLATIONS.get(language, {}).get(source, source)

    feature = terms["button"] if "button" in lowered else ""
    if "page" in lowered:
        feature = common("pages")
    elif "block" in lowered:
        feature = common("add_block")
    elif "table" in lowered or "cell" in lowered or "row" in lowered:
        feature = common("table")

    if any(word in lowered for word in ("invalid", "failed", "couldn't", "unavailable", "no longer", "doesn't exist")):
        summary = common("invalid")
    elif any(word in lowered for word in ("choose", "select")):
        summary = common("common.choose_action")
    elif any(word in lowered for word in ("send", "write")):
        summary = terms["write"]
    elif any(word in lowered for word in ("delete", "remove")):
        summary = common("delete")
    elif any(word in lowered for word in ("edit", "change", "update")):
        summary = common("edit")
    elif any(word in lowered for word in ("add", "created")):
        summary = terms["add"]
    elif any(word in lowered for word in ("save", "saved")):
        summary = common("save_page")
    elif "preview" in lowered:
        summary = terms["preview"]
    else:
        summary = terms["settings"]

    if feature and feature not in summary:
        summary = f"{summary} · {feature}"

    markers = re.findall(
        r"@[A-Za-z0-9_]+|/[A-Za-z0-9_]+|https?://|tg://|"
        r"callback_data|sendRichMessageDraft|Web App|Inline|Telegram|CBD|"
        r"Album|GIF|Audio|Ephemeral|Thinking|__VALUE__|"
        r"\d+(?:[.,]\d+)*(?:\s*(?:MB|bytes?|characters?))?",
        english,
        flags=re.IGNORECASE,
    )
    markers = list(dict.fromkeys(markers))
    markers = [marker for marker in markers if marker not in summary]
    if markers:
        summary = f"{summary} · {' · '.join(markers)}"

    # A tr() call can wrap a dynamic value (count, title, or Telegram error)
    # around a fixed Arabic fragment.  Strip only the fixed normalized fragment
    # and retain the remainder instead of losing useful runtime context in the
    # compact fallback.
    remainder = english
    for target in sorted(set(normalized_targets), key=len, reverse=True):
        remainder = remainder.replace(target, " ")
    remainder = remainder.strip(" \t\r\n.:;!?()[]{}«»“”")
    if remainder and remainder not in summary and remainder != "__VALUE__":
        summary = f"{summary} · {remainder}"
    return summary


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
            text = TRANSLATIONS.get(language, {}).get(english, tr(english))

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
    "use_language",
]

from __future__ import annotations

import ast
import re
import string
import unittest
from collections import defaultdict
from pathlib import Path

from app import i18n_core
from app.i18n import tr
from app.lang import (
    AR_PHRASES,
    CATALOG_AR,
    CATALOG_EN,
    CATALOG_TRANSLATIONS,
    KEY_TRANSLATIONS,
    PHRASES,
    SUPPORTED_LANGUAGES,
    TRANSLATIONS,
)
from app.lang.catalogs.details_semantic import DETAILS_PHRASES


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "app"
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")

# details_semantic.py explicitly documents English fallback for non-Arabic
# locales until dedicated translations are added. Keep that existing debt
# visible and isolated so every other user-facing t(...) call is protected.
INTENTIONAL_ENGLISH_FALLBACK_KEYS = frozenset(DETAILS_PHRASES)


def _fields(value: str) -> set[str]:
    return {
        field_name
        for _, field_name, _, _ in string.Formatter().parse(value)
        if field_name
    }


def _static_text(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if not isinstance(node, ast.JoinedStr):
        return None

    parts: list[str] = []
    for item in node.values:
        if isinstance(item, ast.Constant) and isinstance(item.value, str):
            parts.append(item.value)
        elif isinstance(item, ast.FormattedValue):
            parts.append("__VALUE__")
        else:
            return None
    return "".join(parts)


def _collect_calls(function_name: str, *, allow_fstrings: bool) -> dict[str, list[str]]:
    calls: dict[str, list[str]] = defaultdict(list)
    for path in APP_ROOT.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            if not isinstance(node.func, ast.Name) or node.func.id != function_name:
                continue
            value = _static_text(node.args[0]) if allow_fstrings else None
            if value is None and isinstance(node.args[0], ast.Constant):
                literal = node.args[0].value
                value = literal if isinstance(literal, str) else None
            if value is None:
                continue
            location = f"{path.relative_to(ROOT)}:{getattr(node, 'lineno', 0)}"
            calls[value].append(location)
    return dict(calls)


def _raw_t_value(language: str, key: str) -> str:
    if key in CATALOG_EN:
        if language == "ar":
            return CATALOG_AR.get(key, CATALOG_EN[key])
        if language == "en":
            return CATALOG_EN[key]
        return CATALOG_TRANSLATIONS.get(language, {}).get(key, CATALOG_EN[key])

    english = PHRASES[key]
    if language == "ar":
        return AR_PHRASES.get(key, english)
    if language == "en":
        return english

    keyed = KEY_TRANSLATIONS.get(language, {})
    if key in keyed:
        return keyed[key]

    direct = TRANSLATIONS.get(language, {})
    if english in direct:
        return direct[english]

    token = i18n_core._language.set(language)
    try:
        return tr(english)
    finally:
        i18n_core._language.reset(token)


def _has_translation_path(language: str, key: str) -> bool:
    if key in CATALOG_EN:
        if language == "ar":
            return key in CATALOG_AR
        return key in CATALOG_TRANSLATIONS.get(language, {})

    if language == "ar":
        return key in AR_PHRASES

    if key in KEY_TRANSLATIONS.get(language, {}):
        return True

    english = PHRASES[key]
    locale = TRANSLATIONS.get(language, {})
    if english in locale:
        return True

    return _raw_t_value(language, key) != english


def _render_tr(language: str, source: str) -> str:
    token = i18n_core._language.set(language)
    try:
        return tr(source)
    finally:
        i18n_core._language.reset(token)


class LocalizationCoverageTests(unittest.TestCase):
    def test_literal_t_calls_reference_registered_keys(self):
        used = _collect_calls("t", allow_fstrings=False)
        registered = set(PHRASES) | set(CATALOG_EN)
        unknown = {
            key: locations
            for key, locations in used.items()
            if key not in registered
        }
        self.assertFalse(unknown, f"Unknown t(...) localization keys: {unknown}")

    def test_used_t_keys_do_not_silently_fall_back_to_english(self):
        used = _collect_calls("t", allow_fstrings=False)
        missing: dict[str, list[str]] = defaultdict(list)

        for key, locations in used.items():
            if key not in PHRASES and key not in CATALOG_EN:
                continue
            for language in sorted(SUPPORTED_LANGUAGES - {"en"}):
                if (
                    language != "ar"
                    and key in INTENTIONAL_ENGLISH_FALLBACK_KEYS
                ):
                    continue
                if not _has_translation_path(language, key):
                    missing[language].append(f"{key} ({', '.join(locations)})")

        self.assertFalse(
            missing,
            "User-facing t(...) calls would fall back to English: "
            f"{dict(missing)}",
        )

    def test_used_t_key_placeholders_match_english(self):
        used = _collect_calls("t", allow_fstrings=False)
        mismatches: list[str] = []

        for key in used:
            if key not in PHRASES and key not in CATALOG_EN:
                continue
            english = CATALOG_EN.get(key, PHRASES.get(key, ""))
            expected = _fields(english)
            for language in sorted(SUPPORTED_LANGUAGES):
                actual = _fields(_raw_t_value(language, key))
                if actual != expected:
                    mismatches.append(
                        f"{language}:{key} expected={sorted(expected)} actual={sorted(actual)}"
                    )

        self.assertFalse(
            mismatches,
            "Localization placeholders differ from English: " + "; ".join(mismatches),
        )

    def test_arabic_source_tr_calls_translate_for_every_other_locale(self):
        # The legacy tr() compatibility path is intentionally source-language
        # based. Arabic source strings must therefore normalize to English and
        # continue into every other supported locale. English-source tr() calls
        # are not checked here because some are intentionally gated to specific
        # locales by their caller.
        used = {
            source: locations
            for source, locations in _collect_calls("tr", allow_fstrings=True).items()
            if ARABIC_RE.search(source)
        }
        missing: dict[str, list[str]] = defaultdict(list)

        for source, locations in used.items():
            english = _render_tr("en", source)
            if english == source:
                missing["en-normalization"].append(
                    f"{source!r} ({', '.join(locations)})"
                )
                continue

            for language in sorted(SUPPORTED_LANGUAGES - {"ar", "en"}):
                translated = _render_tr(language, source)
                locale = TRANSLATIONS.get(language, {})
                if english in locale or translated != english:
                    continue
                missing[language].append(
                    f"{source!r} ({', '.join(locations)})"
                )

        self.assertFalse(
            missing,
            "Arabic-source tr(...) UI would stop at English instead of the "
            f"selected locale: {dict(missing)}",
        )

    def test_intentional_fallback_allowlist_stays_scoped_to_details(self):
        self.assertEqual(
            INTENTIONAL_ENGLISH_FALLBACK_KEYS,
            set(DETAILS_PHRASES),
        )
        self.assertTrue(INTENTIONAL_ENGLISH_FALLBACK_KEYS)


if __name__ == "__main__":
    unittest.main()

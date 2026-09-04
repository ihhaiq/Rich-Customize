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


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "app"
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
INTENTIONAL_ENGLISH_FALLBACK_KEYS = frozenset()
PUBLIC_UI_DIRS = (APP_ROOT / "routers", APP_ROOT / "keyboards")
PUBLIC_UI_EXCLUDED_FILES = {APP_ROOT / "routers" / "developer.py"}
INPUT_ONLY_ARABIC = {"دريفت"}
OUTPUT_METHODS = {
    "answer",
    "answer_document",
    "answer_photo",
    "edit_text",
    "send_message",
    "send_photo",
    "send_document",
    "edit_message_text",
}
BUTTON_BUILDERS = {"InlineKeyboardButton", "KeyboardButton"}


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


def _call_name(node: ast.Call) -> str:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return ""


def _contains_unlocalized_arabic(node: ast.AST) -> bool:
    if isinstance(node, ast.Call) and _call_name(node) in {"t", "tr"}:
        return False
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return bool(ARABIC_RE.search(node.value) and node.value not in INPUT_ONLY_ARABIC)
    return any(_contains_unlocalized_arabic(child) for child in ast.iter_child_nodes(node))


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
                if key in INTENTIONAL_ENGLISH_FALLBACK_KEYS:
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

    def test_no_public_output_contains_unlocalized_arabic_literals(self):
        leaks: list[str] = []
        for directory in PUBLIC_UI_DIRS:
            for path in directory.rglob("*.py"):
                if path in PUBLIC_UI_EXCLUDED_FILES:
                    continue
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
                for node in ast.walk(tree):
                    if not isinstance(node, ast.Call):
                        continue
                    name = _call_name(node)
                    expressions: list[ast.AST] = []
                    if name in OUTPUT_METHODS and node.args:
                        expressions.append(node.args[0])
                    if name in BUTTON_BUILDERS:
                        expressions.extend(
                            keyword.value for keyword in node.keywords
                            if keyword.arg == "text"
                        )
                        if node.args:
                            expressions.append(node.args[0])
                    if not expressions:
                        continue
                    if any(_contains_unlocalized_arabic(expr) for expr in expressions):
                        leaks.append(
                            f"{path.relative_to(ROOT)}:{getattr(node, 'lineno', 0)}"
                        )
        self.assertFalse(
            leaks,
            "Public UI contains Arabic literals outside t()/tr(): " + ", ".join(leaks),
        )

    def test_miniapp_html_bootstrap_is_locale_neutral(self):
        html_source = (APP_ROOT / "miniapp_static" / "index.html").read_text(encoding="utf-8")
        self.assertFalse(
            ARABIC_RE.search(html_source),
            "Mini App HTML must use neutral English bootstrap text; localization applies after load.",
        )

    def test_miniapp_translation_fallbacks_are_not_arabic(self):
        fallback_pattern = re.compile(
            r"\btr\(\s*['\"][^'\"]+['\"]\s*,\s*['\"]([^'\"]*)['\"]"
        )
        leaks: list[str] = []
        static_root = APP_ROOT / "miniapp_static"
        for path in static_root.glob("*.js"):
            if path.name in {"miniapp_i18n.js", "miniapp_i18n_locales.js"}:
                continue
            source = path.read_text(encoding="utf-8")
            for match in fallback_pattern.finditer(source):
                if ARABIC_RE.search(match.group(1)):
                    line = source.count("\n", 0, match.start()) + 1
                    leaks.append(f"{path.relative_to(ROOT)}:{line}")
        self.assertFalse(
            leaks,
            "Mini App tr(...) fallbacks must be English/neutral: " + ", ".join(leaks),
        )

    def test_no_intentional_english_fallback_debt_remains(self):
        self.assertFalse(INTENTIONAL_ENGLISH_FALLBACK_KEYS)


if __name__ == "__main__":
    unittest.main()

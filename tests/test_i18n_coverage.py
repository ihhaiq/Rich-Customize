from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path

from app import i18n_core
from app.i18n import EN, t, tr
from app.lang import AR_PHRASES, KEY_TRANSLATIONS, PHRASES, SUPPORTED_LANGUAGES, TRANSLATIONS
from app.lang.catalogs.pages import PAGE_AR_TO_EN
from app.lang.catalogs.recent_ui import RECENT_AR_TO_EN
from app.services.blocks import BLOCK_LABEL_KEYS, get_block_label

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
ROOT = Path(__file__).resolve().parents[1]
SCAN_PATHS = [
    ROOT / "app" / "keyboards",
    ROOT / "app" / "routers" / "block_preview.py",
    ROOT / "app" / "routers" / "editor_ui.py",
    ROOT / "app" / "services" / "blocks.py",
]


def _python_paths(path: Path) -> list[Path]:
    if path.is_dir():
        return sorted(path.rglob("*.py"))
    return [path] if path.is_file() else []


def _english_normalize(text: str) -> str:
    translated = text
    for source, target in sorted(EN.items(), key=lambda item: len(item[0]), reverse=True):
        translated = translated.replace(source, target)
    return translated


def _arabic_literals() -> list[tuple[str, int, str]]:
    found: list[tuple[str, int, str]] = []
    for scan_path in SCAN_PATHS:
        for path in _python_paths(scan_path):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str) and ARABIC_RE.search(node.value):
                    found.append((str(path.relative_to(ROOT)), getattr(node, "lineno", 0), node.value))
    return found


class I18nCoverageTests(unittest.TestCase):
    def test_every_block_uses_a_registered_semantic_key(self):
        self.assertTrue(BLOCK_LABEL_KEYS)
        for block_type, key in BLOCK_LABEL_KEYS.items():
            self.assertIn(key, PHRASES, f"{block_type}: missing {key}")
            self.assertIn(key, AR_PHRASES, f"{block_type}: Arabic missing {key}")

    def test_every_supported_locale_has_every_block_key(self):
        required = set(BLOCK_LABEL_KEYS.values())
        expected_languages = set(SUPPORTED_LANGUAGES) - {"ar", "en"}
        missing = {
            language: sorted(required - set(KEY_TRANSLATIONS.get(language, {})))
            for language in expected_languages
        }
        missing = {language: keys for language, keys in missing.items() if keys}
        self.assertFalse(missing, f"Missing keyed block translations: {missing}")

    def test_block_labels_resolve_from_keyed_locale_catalog(self):
        for language in set(SUPPORTED_LANGUAGES) - {"ar", "en"}:
            token = i18n_core._language.set(language)
            try:
                for block_type, key in BLOCK_LABEL_KEYS.items():
                    self.assertEqual(
                        get_block_label(block_type),
                        KEY_TRANSLATIONS[language][key],
                        f"{language}: {block_type}",
                    )
            finally:
                i18n_core._language.reset(token)

    def test_type_text_regression_for_locales_where_text_differs(self):
        for language in ("fr", "es", "it", "pt", "ru", "tr", "ja", "ko", "vi", "th", "zh-hans", "zh-hant"):
            token = i18n_core._language.set(language)
            try:
                self.assertEqual(get_block_label("text"), KEY_TRANSLATIONS[language]["block.text"])
                self.assertNotEqual(get_block_label("text"), "📝 Text")
            finally:
                i18n_core._language.reset(token)

    def test_unknown_semantic_key_fails_fast(self):
        with self.assertRaises(KeyError):
            t("missing.key.that.must.not.silently.fallback")

    def test_registered_recent_ui_has_english_normalization(self):
        for source in {**PAGE_AR_TO_EN, **RECENT_AR_TO_EN}:
            normalized = _english_normalize(source)
            self.assertIsNone(ARABIC_RE.search(normalized), source)

    def test_recent_ui_never_leaks_arabic_in_non_arabic_locales(self):
        sources = list(PAGE_AR_TO_EN) + list(RECENT_AR_TO_EN)
        for language in TRANSLATIONS:
            if language in {"ar", "fa", "ku", "ur"}:
                continue
            token = i18n_core._language.set(language)
            try:
                for source in sources:
                    rendered = tr(source)
                    self.assertIsNone(
                        ARABIC_RE.search(rendered),
                        f"{language}: {source!r} -> {rendered!r}",
                    )
            finally:
                i18n_core._language.reset(token)

    def test_block_service_contains_no_hardcoded_arabic_ui(self):
        path = ROOT / "app" / "services" / "blocks.py"
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        leaked = [
            (getattr(node, "lineno", 0), node.value)
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and ARABIC_RE.search(node.value)
        ]
        self.assertFalse(leaked, f"blocks.py must use semantic keys only: {leaked}")

    def test_source_audit_reports_only_registered_or_legacy_ui(self):
        uncovered = []
        recent_sources = set(PAGE_AR_TO_EN) | set(RECENT_AR_TO_EN)
        for path, line, text in _arabic_literals():
            if text in recent_sources:
                continue
            normalized = _english_normalize(text)
            if ARABIC_RE.search(normalized):
                uncovered.append(f"{path}:{line}: {text!r}")
        self.assertLess(
            len(uncovered),
            80,
            "Too many uncovered Arabic UI literals; new UI must use semantic i18n keys.\n"
            + "\n".join(uncovered),
        )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import ast
import re
import string
import unittest
from pathlib import Path

from app import i18n_core
from app.i18n import t
from app.locales import SUPPORTED_LANGUAGES
from app.locales.catalog import CATALOG_AR, CATALOG_EN, CATALOG_TRANSLATIONS

ROOT = Path(__file__).resolve().parents[1]
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


def _fields(value: str) -> set[str]:
    return {
        field_name
        for _, field_name, _, _ in string.Formatter().parse(value)
        if field_name
    }


class SemanticCatalogTests(unittest.TestCase):
    def test_arabic_catalog_has_every_key(self):
        self.assertEqual(set(CATALOG_AR), set(CATALOG_EN))

    def test_every_supported_locale_has_every_catalog_key(self):
        required = set(CATALOG_EN)
        missing = {
            language: sorted(required - set(CATALOG_TRANSLATIONS.get(language, {})))
            for language in set(SUPPORTED_LANGUAGES) - {"ar", "en"}
        }
        missing = {language: keys for language, keys in missing.items() if keys}
        self.assertFalse(missing, f"Missing semantic catalog translations: {missing}")

    def test_placeholders_match_reference_language(self):
        for key, english in CATALOG_EN.items():
            expected = _fields(english)
            self.assertEqual(_fields(CATALOG_AR[key]), expected, f"ar:{key}")
            for language, translations in CATALOG_TRANSLATIONS.items():
                self.assertEqual(
                    _fields(translations[key]),
                    expected,
                    f"{language}:{key}",
                )

    def test_t_renders_every_catalog_key_for_every_locale(self):
        values = {"label": "LABEL", "reason": "REASON"}
        for language in SUPPORTED_LANGUAGES:
            token = i18n_core._language.set(language)
            try:
                for key in CATALOG_EN:
                    kwargs = {name: values[name] for name in _fields(CATALOG_EN[key])}
                    rendered = t(key, **kwargs)
                    self.assertTrue(rendered, f"{language}:{key}")
            finally:
                i18n_core._language.reset(token)

    def test_migrated_block_preview_contains_no_arabic_ui_literals(self):
        path = ROOT / "app" / "routers" / "block_preview.py"
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        leaked = [
            (getattr(node, "lineno", 0), node.value)
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and ARABIC_RE.search(node.value)
        ]
        self.assertFalse(leaked, f"block_preview.py must use t(key): {leaked}")

    def test_migrated_block_preview_does_not_call_legacy_tr(self):
        path = ROOT / "app" / "routers" / "block_preview.py"
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        legacy_calls = [
            getattr(node, "lineno", 0)
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "tr"
        ]
        self.assertFalse(legacy_calls, f"Legacy tr() calls found at {legacy_calls}")


if __name__ == "__main__":
    unittest.main()

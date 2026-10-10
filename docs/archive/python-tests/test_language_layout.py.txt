from __future__ import annotations

import unittest
from pathlib import Path

from app.lang import BUNDLES, LANGUAGE_MODULES, SUPPORTED_LANGUAGES, TRANSLATIONS


class LanguageFolderLayoutTests(unittest.TestCase):
    def test_every_supported_language_has_its_own_package(self):
        root = Path(__file__).resolve().parents[1] / "app" / "lang"
        self.assertEqual(SUPPORTED_LANGUAGES, frozenset(LANGUAGE_MODULES))
        for code, module_name in LANGUAGE_MODULES.items():
            package = root / module_name / "__init__.py"
            self.assertTrue(package.is_file(), f"missing language package for {code}: {package}")
            self.assertEqual(BUNDLES[code].code, code)

    def test_arabic_source_translation_is_available_for_legacy_tr(self):
        self.assertIn("ar", TRANSLATIONS)
        self.assertEqual(TRANSLATIONS["ar"], BUNDLES["ar"].translations)
        self.assertTrue(TRANSLATIONS["ar"])

    def test_language_runtime_has_no_locales_dependency(self):
        root = Path(__file__).resolve().parents[1] / "app"
        checked = [
            root / "lang" / "__init__.py",
            root / "lang" / "bundle_loader.py",
            root / "i18n.py",
            root / "i18n_runtime.py",
            root / "i18n_profile.py",
        ]
        for path in checked:
            source = path.read_text(encoding="utf-8")
            self.assertNotIn("app.locales", source, str(path))

    def test_historical_locales_package_is_removed(self):
        root = Path(__file__).resolve().parents[1] / "app"
        self.assertFalse((root / "locales").exists())


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest
from pathlib import Path

from app.lang import (
    AR_PHRASES,
    BUNDLES,
    CATALOG_AR,
    CATALOG_EN,
    CATALOG_TRANSLATIONS,
    KEY_TRANSLATIONS,
    LANGUAGE_MODULES,
    PHRASES,
    PROFILES,
    SUPPORTED_LANGUAGES,
    TRANSLATIONS,
)
from app.locales import PROFILES as LEGACY_PROFILES
from app.locales import SUPPORTED_LANGUAGES as LEGACY_SUPPORTED_LANGUAGES
from app.locales import TRANSLATIONS as LEGACY_TRANSLATIONS
from app.locales.catalog import CATALOG_AR as LEGACY_CATALOG_AR
from app.locales.catalog import CATALOG_EN as LEGACY_CATALOG_EN
from app.locales.catalog import CATALOG_TRANSLATIONS as LEGACY_CATALOG_TRANSLATIONS
from app.locales.common import AR_PHRASES as LEGACY_AR_PHRASES
from app.locales.common import KEY_TRANSLATIONS as LEGACY_KEY_TRANSLATIONS
from app.locales.common import PHRASES as LEGACY_PHRASES


class LanguageFolderLayoutTests(unittest.TestCase):
    def test_every_supported_language_has_its_own_package(self):
        root = Path(__file__).resolve().parents[1] / "app" / "lang"
        self.assertEqual(SUPPORTED_LANGUAGES, frozenset(LANGUAGE_MODULES))
        for code, module_name in LANGUAGE_MODULES.items():
            package = root / module_name / "__init__.py"
            self.assertTrue(package.is_file(), f"missing language package for {code}: {package}")
            self.assertEqual(BUNDLES[code].code, code)

    def test_new_registry_preserves_existing_translation_data(self):
        self.assertEqual(SUPPORTED_LANGUAGES, LEGACY_SUPPORTED_LANGUAGES)
        self.assertEqual(
            {code: values for code, values in TRANSLATIONS.items() if code != "ar"},
            LEGACY_TRANSLATIONS,
        )
        self.assertEqual(TRANSLATIONS["ar"], BUNDLES["ar"].translations)
        self.assertTrue(TRANSLATIONS["ar"])
        self.assertEqual(PROFILES, LEGACY_PROFILES)
        self.assertEqual(PHRASES, LEGACY_PHRASES)
        self.assertEqual(AR_PHRASES, LEGACY_AR_PHRASES)
        self.assertEqual(KEY_TRANSLATIONS, LEGACY_KEY_TRANSLATIONS)
        self.assertEqual(CATALOG_EN, LEGACY_CATALOG_EN)
        self.assertEqual(CATALOG_AR, LEGACY_CATALOG_AR)
        self.assertEqual(CATALOG_TRANSLATIONS, LEGACY_CATALOG_TRANSLATIONS)

    def test_i18n_uses_new_language_registry(self):
        source = (Path(__file__).resolve().parents[1] / "app" / "i18n.py").read_text(encoding="utf-8")
        self.assertIn("from app.lang import (", source)
        self.assertNotIn("from app.locales import PROFILES", source)
        self.assertNotIn("from app.locales.catalog import", source)
        self.assertNotIn("from app.locales.common import", source)


if __name__ == "__main__":
    unittest.main()

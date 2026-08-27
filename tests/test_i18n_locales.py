import unittest

from app import i18n_core
from app.i18n import _profiles, resolve_language, tr
from app.locales import PROFILES, TRANSLATIONS


class LocalePackTests(unittest.TestCase):
    def test_bot_profile_names_show_beta_status(self):
        profiles = _profiles()

        self.assertEqual(profiles[None]["name"], "Rich Message Editor - BETA")
        self.assertEqual(profiles["en"]["name"], "Rich Message Editor - BETA")
        self.assertEqual(
            profiles["ar"]["name"],
            "محرّر الرسائل الغنية - اصدار تجريبي",
        )
        for language, profile in profiles.items():
            if language != "ar":
                self.assertTrue(profile["name"].endswith("BETA"), language)
            self.assertLessEqual(len(profile["name"]), 64, language)

    def test_nineteen_new_languages_are_registered(self):
        expected = {
            "es", "fr", "de", "it", "pt", "ru", "tr", "fa", "ku",
            "hi", "ur", "id", "ja", "ko", "uk", "nl", "pl", "vi", "th",
        }
        self.assertEqual(expected, set(PROFILES))
        self.assertTrue(expected.issubset(TRANSLATIONS))

    def test_language_resolution_uses_primary_telegram_code(self):
        self.assertEqual(resolve_language("es-MX"), "es")
        self.assertEqual(resolve_language("pt_BR"), "pt")
        self.assertEqual(resolve_language("zh-TW"), "zh-hant")
        self.assertEqual(resolve_language("zh-CN"), "zh-hans")
        self.assertEqual(resolve_language("xx"), "en")

    def test_locale_translation_runs_after_arabic_to_english_normalization(self):
        token = i18n_core._language.set("es")
        try:
            self.assertEqual(tr("تخصيص الرسالة"), "Personalizar mensaje")
            self.assertEqual(tr("👁 معاينة هذا الـBlock"), "👁 Vista previa de este bloque")
        finally:
            i18n_core._language.reset(token)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from app.i18n import resolve_language, t, use_language
from app.lang import PHRASES
from app.lang.ar.core import CORE_PHRASES


class ArabicCoreLocalizationTests(unittest.TestCase):
    def test_telegram_arabic_locale_variants_resolve_to_arabic(self):
        for language_code in ("ar", "ar-IQ", "ar_SA", "AR-eg"):
            self.assertEqual(resolve_language(language_code), "ar")

    def test_start_message_is_arabic(self):
        with use_language("ar-IQ"):
            self.assertEqual(t("welcome"), "أهلًا بك في محرّر الرسائل الغنية.")
            self.assertEqual(t("start_editor"), "أرسل /editor لبدء رسالة جديدة.")

    def test_every_core_override_replaces_the_english_fallback(self):
        with use_language("ar"):
            leaked = {
                key: t(key)
                for key in CORE_PHRASES
                if t(key) == PHRASES[key]
            }
        self.assertFalse(leaked, f"Arabic core UI fell back to English: {leaked}")


if __name__ == "__main__":
    unittest.main()

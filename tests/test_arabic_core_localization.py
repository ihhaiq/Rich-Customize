from __future__ import annotations

import unittest

from app.i18n import resolve_language, t, use_language
from app.lang import PHRASES


CORE_KEYS = {
    "customize",
    "choose_block",
    "block_added",
    "welcome",
    "start_editor",
    "send_message",
    "unsupported",
    "expired",
    "add_block",
    "result",
    "create_post",
    "edit",
    "move",
    "preview_ready",
    "add_buttons",
    "buttons_manage",
    "post_settings",
    "send_now",
    "details",
    "photo",
    "video",
    "audio",
    "voice",
    "document",
    "table",
    "list",
    "paragraph",
    "heading",
    "footer",
    "divider",
    "map",
    "choose_action",
    "send_file",
    "send_photo",
    "send_video",
    "send_audio",
    "send_voice",
}


class ArabicCoreLocalizationTests(unittest.TestCase):
    def test_telegram_arabic_locale_variants_resolve_to_arabic(self):
        for language_code in ("ar", "ar-IQ", "ar_SA", "AR-eg"):
            self.assertEqual(resolve_language(language_code), "ar")

    def test_start_message_is_arabic(self):
        with use_language("ar-IQ"):
            self.assertEqual(t("welcome"), "أهلًا بك في محرّر الرسائل الغنية.")
            self.assertEqual(t("start_editor"), "أرسل /editor لبدء رسالة جديدة.")

    def test_core_arabic_ui_does_not_fall_back_to_english(self):
        with use_language("ar"):
            leaked = {
                key: t(key)
                for key in CORE_KEYS
                if t(key) == PHRASES[key]
            }
        self.assertFalse(leaked, f"Arabic core UI fell back to English: {leaked}")


if __name__ == "__main__":
    unittest.main()

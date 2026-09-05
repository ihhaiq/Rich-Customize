from __future__ import annotations

import unittest

from aiogram.types import User

from app.i18n import use_language
from app.lang import KEY_TRANSLATIONS, SUPPORTED_LANGUAGES
from app.lang.catalogs.welcome_semantic import (
    WELCOME_AR_PHRASES,
    WELCOME_KEY_TRANSLATIONS,
    WELCOME_PHRASES,
)
from app.services.welcome import (
    SHOWCASE_URL,
    SUPPORT_URL,
    UPDATES_URL,
    build_welcome_rich_message,
)

WELCOME_KEYS = set(WELCOME_PHRASES)


class WelcomeRichLocalizationTests(unittest.TestCase):
    def test_every_supported_locale_has_welcome_copy(self):
        self.assertEqual(set(WELCOME_AR_PHRASES), WELCOME_KEYS)
        expected = set(SUPPORTED_LANGUAGES) - {"ar", "en"}
        self.assertEqual(set(WELCOME_KEY_TRANSLATIONS), expected)
        for language in sorted(expected):
            self.assertEqual(
                set(WELCOME_KEY_TRANSLATIONS[language]),
                WELCOME_KEYS,
                language,
            )
            self.assertTrue(WELCOME_KEYS <= set(KEY_TRANSLATIONS[language]), language)

    def test_arabic_copy_matches_requested_start_message(self):
        self.assertEqual(WELCOME_AR_PHRASES["welcome.greeting"], "مرحبا")
        self.assertEqual(WELCOME_AR_PHRASES["welcome.view_button"], "👁 انظر")
        self.assertEqual(WELCOME_AR_PHRASES["welcome.updates_button"], "قناة التحديثات")
        self.assertEqual(WELCOME_AR_PHRASES["welcome.support_button"], "مجموعة الدعم")

    def test_rich_welcome_contains_real_mention_and_three_rich_buttons(self):
        user = User(id=123456789, is_bot=False, first_name="حسين")
        with use_language("ar-IQ"):
            rich_message = build_welcome_rich_message(user)
        payload = rich_message.model_dump(mode="json", exclude_none=True)
        paragraph = payload["blocks"][0]
        rich_text = paragraph["text"]

        mention = next(item for item in rich_text if isinstance(item, dict) and item.get("type") == "text_mention")
        self.assertEqual(mention["text"], "حسين")
        self.assertEqual(mention["user"]["id"], user.id)

        buttons = [
            item["button"]
            for item in rich_text
            if isinstance(item, dict) and item.get("type") == "button"
        ]
        self.assertEqual(len(buttons), 3)
        self.assertEqual(
            {button["url"] for button in buttons},
            {SHOWCASE_URL, UPDATES_URL, SUPPORT_URL},
        )
        self.assertEqual(
            {button["text"] for button in buttons},
            {"👁 انظر", "قناة التحديثات", "مجموعة الدعم"},
        )


if __name__ == "__main__":
    unittest.main()

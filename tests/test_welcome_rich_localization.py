from __future__ import annotations

import unittest

from aiogram.types import User

from app.i18n import t, use_language
from app.lang import KEY_TRANSLATIONS, SUPPORTED_LANGUAGES
from app.lang.catalogs.welcome_revision import (
    WELCOME_REVISION_AR_PHRASES,
    WELCOME_REVISION_KEY_TRANSLATIONS,
    WELCOME_REVISION_PHRASES,
)
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
REVISION_KEYS = set(WELCOME_REVISION_PHRASES)


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

    def test_every_supported_locale_has_revised_welcome_copy(self):
        self.assertEqual(set(WELCOME_REVISION_AR_PHRASES), REVISION_KEYS)
        expected = set(SUPPORTED_LANGUAGES) - {"ar", "en"}
        self.assertEqual(set(WELCOME_REVISION_KEY_TRANSLATIONS), expected)
        for language in sorted(expected):
            self.assertEqual(
                set(WELCOME_REVISION_KEY_TRANSLATIONS[language]),
                REVISION_KEYS,
                language,
            )
            self.assertTrue(REVISION_KEYS <= set(KEY_TRANSLATIONS[language]), language)

    def test_arabic_copy_matches_requested_start_message(self):
        with use_language("ar-IQ"):
            self.assertEqual(t("welcome.greeting"), "مرحبا")
            self.assertEqual(t("welcome.view_button"), "👁 انظر")
            self.assertEqual(t("welcome.add_prompt"), "👈🏻 أضفني في مجموعتك/قناتك")
            self.assertEqual(
                t("welcome.start_prompt"),
                "وابدأ في استعمال البوت عن طريق الضغط على زر",
            )
            self.assertEqual(t("welcome.and"), "و")
            self.assertEqual(t("welcome.add_group_button"), "➕ أضفني إلى مجموعة ➕")
            self.assertEqual(t("welcome.updates_button"), "قناة التحديثات")
            self.assertEqual(t("welcome.support_button"), "مجموعة الدعم")

    def test_rich_welcome_contains_mention_bold_prompt_and_rich_actions(self):
        user = User(id=123456789, is_bot=False, first_name="حسين")
        with use_language("ar-IQ"):
            rich_message = build_welcome_rich_message(user)
        payload = rich_message.model_dump(mode="json", exclude_none=True)
        rich_text = payload["blocks"][0]["text"]

        mention = next(
            item for item in rich_text
            if isinstance(item, dict) and item.get("type") == "text_mention"
        )
        self.assertEqual(mention["text"], "حسين")
        self.assertEqual(mention["user"]["id"], user.id)

        bold = next(
            item for item in rich_text
            if isinstance(item, dict) and item.get("type") == "bold"
        )
        self.assertEqual(bold["text"], "👈🏻 أضفني في مجموعتك/قناتك")

        buttons = [
            item["button"]
            for item in rich_text
            if isinstance(item, dict) and item.get("type") == "button"
        ]
        self.assertEqual(len(buttons), 4)
        url_buttons = {button["text"]: button["url"] for button in buttons if "url" in button}
        self.assertEqual(url_buttons["👁 انظر"], SHOWCASE_URL)
        self.assertEqual(url_buttons["قناة التحديثات"], UPDATES_URL)
        self.assertEqual(url_buttons["مجموعة الدعم"], SUPPORT_URL)

        start_button = next(button for button in buttons if button.get("callback_data"))
        self.assertEqual(start_button["text"], "➕ بدء المحرّر")
        self.assertEqual(start_button["callback_data"], "r:starteditor")
        self.assertEqual(SHOWCASE_URL, "https://t.me/durov/531")


if __name__ == "__main__":
    unittest.main()

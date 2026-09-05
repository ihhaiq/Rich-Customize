from __future__ import annotations

import unittest

from aiogram.types import User

from app.i18n import t, use_language
from app.lang import KEY_TRANSLATIONS, SUPPORTED_LANGUAGES
from app.lang.catalogs.welcome_compact import (
    WELCOME_COMPACT_AR_PHRASES,
    WELCOME_COMPACT_KEY_TRANSLATIONS,
    WELCOME_COMPACT_PHRASES,
)
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
    BOT_USERNAME,
    SHOWCASE_URL,
    SUPPORT_URL,
    UPDATES_URL,
    build_welcome_rich_message,
)

WELCOME_KEYS = set(WELCOME_PHRASES)
REVISION_KEYS = set(WELCOME_REVISION_PHRASES)
COMPACT_KEYS = set(WELCOME_COMPACT_PHRASES)


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

    def test_every_supported_locale_has_compact_welcome_copy(self):
        self.assertEqual(set(WELCOME_COMPACT_AR_PHRASES), COMPACT_KEYS)
        expected = set(SUPPORTED_LANGUAGES) - {"ar", "en"}
        self.assertEqual(set(WELCOME_COMPACT_KEY_TRANSLATIONS), expected)
        for language in sorted(expected):
            self.assertEqual(
                set(WELCOME_COMPACT_KEY_TRANSLATIONS[language]),
                COMPACT_KEYS,
                language,
            )
            self.assertTrue(COMPACT_KEYS <= set(KEY_TRANSLATIONS[language]), language)

    def test_arabic_copy_matches_requested_start_message(self):
        with use_language("ar-IQ"):
            self.assertEqual(t("welcome.greeting"), "مرحبا")
            self.assertEqual(
                t("welcome.product_description"),
                "محرّر متكامل لإنشاء وتخصيص رسائل تليكرام الغنية.",
            )
            self.assertEqual(t("welcome.view_button"), "👁 انظر")
            self.assertEqual(t("welcome.and"), "و")
            self.assertEqual(t("welcome.add_group_button"), "➕ أضفني إلى مجموعة ➕")
            self.assertEqual(t("welcome.updates_button"), "قناة التحديثات")
            self.assertEqual(t("welcome.support_button"), "مجموعة الدعم")

    def test_rich_welcome_uses_compact_visual_hierarchy(self):
        user = User(id=123456789, is_bot=False, first_name="حسين")
        with use_language("ar-IQ"):
            rich_message = build_welcome_rich_message(user)
        payload = rich_message.model_dump(mode="json", exclude_none=True)
        blocks = payload["blocks"]

        self.assertEqual([block["type"] for block in blocks], [
            "heading", "paragraph", "footer", "footer",
        ])

        heading = blocks[0]
        self.assertEqual(heading["size"], 3)
        mention = next(
            item for item in heading["text"]
            if isinstance(item, dict) and item.get("type") == "text_mention"
        )
        self.assertEqual(mention["text"], "حسين")
        self.assertEqual(mention["user"]["id"], user.id)

        intro = blocks[1]["text"]
        self.assertEqual(intro[0], "محرّر متكامل لإنشاء وتخصيص رسائل تليكرام الغنية.")

        self.assertEqual(blocks[2]["text"], BOT_USERNAME)

        help_text = blocks[3]["text"]
        self.assertEqual(help_text[0], "📌 بعض المساعدة؟")

        all_rich_text = []
        for block in blocks:
            text = block.get("text")
            if isinstance(text, list):
                all_rich_text.extend(text)
        buttons = [
            item["button"]
            for item in all_rich_text
            if isinstance(item, dict) and item.get("type") == "button"
        ]
        self.assertEqual(len(buttons), 3)
        self.assertFalse(any(button.get("callback_data") for button in buttons))
        url_buttons = {button["text"]: button["url"] for button in buttons}
        self.assertEqual(url_buttons["👁 انظر"], SHOWCASE_URL)
        self.assertEqual(url_buttons["قناة التحديثات"], UPDATES_URL)
        self.assertEqual(url_buttons["مجموعة الدعم"], SUPPORT_URL)
        self.assertEqual(SHOWCASE_URL, "https://t.me/durov/531")


if __name__ == "__main__":
    unittest.main()

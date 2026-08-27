import re
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app import i18n_core
from app.i18n import tr
from app.locales import TRANSLATIONS
from app.routers.editor_core import (
    _delete_stored_block_prompt, _math_input_prompt,
    _opened_page_text, _saved_pages_text,
)

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


class SavedPagesLocalizationTests(unittest.TestCase):
    def test_arabic_math_prompt_explains_escaped_space(self):
        token = i18n_core._language.set("ar")
        try:
            prompt = _math_input_prompt()
        finally:
            i18n_core._language.reset(token)

        self.assertIn("لإضافة مسافة بين النصوص", prompt)
        self.assertTrue(prompt.endswith("\\ "))

    def test_every_locale_translates_math_space_hint(self):
        for language in TRANSLATIONS:
            token = i18n_core._language.set(language)
            try:
                prompt = _math_input_prompt()
            finally:
                i18n_core._language.reset(token)

            self.assertTrue(prompt.endswith("\\ "), language)
            self.assertNotEqual(prompt, "Send the formula in LaTeX.\n\nTo add a space between text, use: \\ ", language)

    def test_saved_pages_show_copyable_codes_in_message_text(self):
        pages = [
            {"page_id": "a86d3132", "title": "الأولى"},
            {"page_id": "b1234567", "title": "<صفحة>"},
        ]

        rendered = _saved_pages_text(pages)

        self.assertIn("📄 الأولى — <code>a86d3132</code>", rendered)
        self.assertIn("📄 &lt;صفحة&gt; — <code>b1234567</code>", rendered)

    def test_opened_page_editor_shows_copyable_code(self):
        rendered = _opened_page_text("a86d3132", {"title": "الأولى"})

        self.assertIn("📄 الأولى — <code>a86d3132</code>", rendered)
        self.assertIn("تخصيص الرسالة", rendered)

    def test_french_saved_pages_screen_has_no_arabic(self):
        token = i18n_core._language.set("fr")
        try:
            rendered = tr("📚 صفحاتك المحفوظة\n\nاختر صفحة لفتحها وتعديلها:")
            self.assertEqual(
                rendered,
                "📚 Vos pages enregistrées\n\nChoisissez une page à ouvrir et modifier :",
            )
            self.assertIsNone(ARABIC_RE.search(rendered))
            self.assertIsNone(ARABIC_RE.search(tr("ما عندك صفحات محفوظة بعد.")))
            self.assertIsNone(ARABIC_RE.search(tr("الصفحة محذوفة أو لا تخصك.")))
        finally:
            i18n_core._language.reset(token)

    def test_every_added_locale_translates_saved_pages_heading(self):
        expected = {
            "es", "fr", "de", "it", "pt", "ru", "tr", "fa", "ku",
            "hi", "ur", "id", "ja", "ko", "uk", "nl", "pl", "vi", "th",
        }
        for language in expected:
            pack = TRANSLATIONS[language]
            self.assertIn("📚 Your saved pages", pack, language)
            self.assertIn("Choose a page to open and edit:", pack, language)
            self.assertIn("You don't have any saved pages yet.", pack, language)


class BlockPromptCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_back_cleanup_deletes_only_the_separate_prompt(self):
        bot = SimpleNamespace(delete_message=AsyncMock())
        state = SimpleNamespace(update_data=AsyncMock())
        management = SimpleNamespace(
            chat=SimpleNamespace(id=10),
            message_id=20,
        )

        await _delete_stored_block_prompt(
            bot,
            state,
            {"add_prompt_chat_id": 10, "add_prompt_message_id": 21},
            protected_message=management,
        )

        bot.delete_message.assert_awaited_once_with(chat_id=10, message_id=21)
        state.update_data.assert_awaited_once_with(
            add_prompt_chat_id=None,
            add_prompt_message_id=None,
        )

    async def test_back_cleanup_never_deletes_management_message(self):
        bot = SimpleNamespace(delete_message=AsyncMock())
        state = SimpleNamespace(update_data=AsyncMock())
        management = SimpleNamespace(
            chat=SimpleNamespace(id=10),
            message_id=20,
        )

        await _delete_stored_block_prompt(
            bot,
            state,
            {"add_prompt_chat_id": 10, "add_prompt_message_id": 20},
            protected_message=management,
        )

        bot.delete_message.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()

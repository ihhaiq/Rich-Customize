import re
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app import i18n_core
from app.i18n import t, tr
from app.locales import TRANSLATIONS
from app.routers.editor_core import (
    _delete_stored_block_prompt, _math_input_prompt,
    _opened_page_text, _page_screen, _saved_pages_text, _session, new_editor,
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

    def test_every_locale_translates_closed_editor_message_and_button(self):
        for language in TRANSLATIONS:
            token = i18n_core._language.set(language)
            try:
                hint = t("editor.closed_hint")
                button = t("editor.start_button")
                new_button = t("editor.new_button")
                empty = t("editor.empty_hint")
            finally:
                i18n_core._language.reset(token)

            self.assertNotEqual(
                hint,
                "Use the editor buttons, or send /editor to start a new message.",
                language,
            )
            self.assertNotEqual(button, "▶️ Start editor", language)
            self.assertNotEqual(new_button, "➕ Start editor", language)
            self.assertNotEqual(
                empty,
                "Customize message\n\nAdd a Block or open one of your saved pages:",
                language,
            )

    def test_every_locale_translates_page_management_actions(self):
        english = {
            "pages.rename_prompt": "Send a new name for “Demo”; maximum 64 characters.",
            "pages.delete_confirm": "Permanently delete “Demo”?",
            "pages.delete_yes": "🗑 Yes, delete",
            "common.cancel": "Cancel",
            "pages.deleted": "Page deleted",
        }
        for language in TRANSLATIONS:
            token = i18n_core._language.set(language)
            try:
                rendered = {
                    "pages.rename_prompt": t("pages.rename_prompt", title="Demo"),
                    "pages.delete_confirm": t("pages.delete_confirm", title="Demo"),
                    "pages.delete_yes": t("pages.delete_yes"),
                    "common.cancel": t("common.cancel"),
                    "pages.deleted": t("pages.deleted"),
                }
            finally:
                i18n_core._language.reset(token)

            for key, value in rendered.items():
                self.assertNotEqual(value, english[key], f"{language}: {key}")

    def test_saved_pages_text_shows_titles_without_codes(self):
        pages = [
            {"page_id": "a86d3132", "title": "الأولى"},
            {"page_id": "b1234567", "title": "<صفحة>"},
        ]

        rendered = _saved_pages_text(pages)

        self.assertIn("📄 الأولى", rendered)
        self.assertIn("📄 &lt;صفحة&gt;", rendered)
        self.assertNotIn("a86d3132", rendered)
        self.assertNotIn("b1234567", rendered)
        self.assertNotIn("<code>", rendered)

    def test_opened_page_editor_shows_title_without_code(self):
        rendered = _opened_page_text({"title": "الأولى"})

        self.assertIn("📄 الأولى", rendered)
        self.assertNotIn("a86d3132", rendered)
        self.assertNotIn("<code>", rendered)
        self.assertIn("تخصيص الرسالة", rendered)

    def test_saved_pages_are_paginated_and_out_of_range_is_clamped(self):
        pages = [{"page_id": str(index)} for index in range(10)]

        visible, page_index, total_pages = _page_screen(pages, 99)

        self.assertEqual([page["page_id"] for page in visible], ["8", "9"])
        self.assertEqual(page_index, 2)
        self.assertEqual(total_pages, 3)

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
    async def test_empty_block_list_is_a_valid_editor_session(self):
        callback = SimpleNamespace(answer=AsyncMock())
        state = SimpleNamespace(get_data=AsyncMock(return_value={"blocks": []}))

        session = await _session(callback, state)

        self.assertEqual(session, ({"blocks": []}, []))
        callback.answer.assert_not_awaited()

    async def test_editor_command_opens_an_empty_editor_immediately(self):
        sent = SimpleNamespace(chat=SimpleNamespace(id=10), message_id=20)
        message = SimpleNamespace(answer=AsyncMock(return_value=sent))
        state = SimpleNamespace(
            clear=AsyncMock(),
            set_state=AsyncMock(),
            update_data=AsyncMock(),
        )

        await new_editor(message, state)

        state.clear.assert_awaited_once()
        message.answer.assert_awaited_once()
        state.update_data.assert_awaited_once()
        self.assertEqual(state.update_data.await_args.kwargs["blocks"], [])

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

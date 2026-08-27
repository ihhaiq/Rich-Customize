import re
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app import i18n_core
from app.i18n import t, tr
from app.locales import TRANSLATIONS
from app.locales.common import EDITOR_UX_KEYS, KEY_TRANSLATIONS
from app.routers.editor_core import (
    _block_page, _code_input_prompt, _delete_stored_block_prompt, _math_input_prompt,
    _opened_page_text, _page_screen, _saved_pages_text, _session, new_editor,
    _pages_for_user,
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

    def test_every_locale_explains_how_to_set_code_language(self):
        english = (
            "Send the code.\n\nTo set its language, start with /lang python, "
            "then put the code on the following lines. You can also use a fenced "
            "block such as ```python ... ```."
        )
        for language in TRANSLATIONS:
            token = i18n_core._language.set(language)
            try:
                prompt = _code_input_prompt()
            finally:
                i18n_core._language.reset(token)

            self.assertIn("/lang python", prompt, language)
            self.assertIn("```python", prompt, language)
            if language != "ar":
                self.assertNotEqual(prompt, english, language)

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

    def test_every_locale_has_the_new_editor_ux_keys(self):
        for language in TRANSLATIONS:
            if language == "ar":
                continue
            missing = set(EDITOR_UX_KEYS) - set(KEY_TRANSLATIONS.get(language, {}))
            self.assertFalse(missing, f"{language}: {sorted(missing)}")

    def test_saved_pages_text_leaves_titles_and_codes_to_buttons(self):
        rendered = _saved_pages_text()

        self.assertNotIn("الأولى", rendered)
        self.assertNotIn("&lt;صفحة&gt;", rendered)
        self.assertNotIn("a86d3132", rendered)
        self.assertNotIn("b1234567", rendered)
        self.assertNotIn("<code>", rendered)

    def test_opened_page_editor_shows_only_editor_text(self):
        rendered = _opened_page_text()

        self.assertEqual(rendered, "تخصيص الرسالة\n\nاختر الجزء الذي تريد تعديله:")

    def test_saved_pages_are_paginated_and_out_of_range_is_clamped(self):
        pages = [{"page_id": str(index)} for index in range(10)]

        visible, page_index, total_pages = _page_screen(pages, 99)

        self.assertEqual([page["page_id"] for page in visible], ["8", "9"])
        self.assertEqual(page_index, 2)
        self.assertEqual(total_pages, 3)

    def test_block_page_shows_current_position_and_ordered_names(self):
        blocks = [
            {"id": "photo", "type": "photo", "position": 1, "data": {}},
            {"id": "text", "type": "paragraph", "position": 0, "data": {}},
        ]

        token = i18n_core._language.set("ar")
        try:
            rendered = _block_page(blocks[0], blocks)
        finally:
            i18n_core._language.reset(token)

        self.assertIn("الموقع الحالي: 2 من 2", rendered)
        order = rendered.split("ترتيب البلوكات:\n", 1)[1]
        self.assertLess(order.index("📝 فقرة"), order.index("🖼 صورة"))
        self.assertIn("◀️ 2. 🖼 صورة", rendered)

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
    async def test_pages_can_be_searched_and_sorted_by_latest_update(self):
        pages = [
            {"page_id": "a", "title": "Alpha", "updated_at": 10},
            {"page_id": "b", "title": "Beta", "updated_at": 30},
            {"page_id": "c", "title": "Other", "updated_at": 50},
        ]
        with patch(
            "app.routers.editor_core.page_registry.list_for_user",
            AsyncMock(return_value=pages),
        ):
            found, visible, page_index, total_pages, total_count = await _pages_for_user(
                7, 0, "a", "updated",
            )

        self.assertEqual([page["page_id"] for page in found], ["b", "a"])
        self.assertEqual(found, visible)
        self.assertEqual((page_index, total_pages, total_count), (0, 1, 3))

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

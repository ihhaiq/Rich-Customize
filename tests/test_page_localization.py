import re
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app import i18n_core
from app.i18n import t, tr
from app.locales import TRANSLATIONS
from app.locales.common import (
    DETAILS_INNER_KEYS, EDITOR_UX_KEYS, KEY_TRANSLATIONS, LIST_UI_KEYS,
    RICH_IMPORT_KEYS,
)
from app.editor.session import load_editor_session as _session
from app.editor.history import UNDO_KEY
from app.routers.editor_entry import new_editor
from app.routers.editor_preview import import_rich_message_into_editor
from app.routers.editor_ui import (
    delete_stored_block_prompt as _delete_stored_block_prompt,
    editor_overview_text as _editor_overview_text,
)
from app.routers.block_input_support import (
    code_input_prompt as _code_input_prompt,
    math_input_prompt as _math_input_prompt,
)
from app.routers.block_view import block_page as _block_page
from app.routers.button_target_picker import ask_for_button_user as _ask_for_button_user
from app.routers.details_edit import receive_nested_replacement as _receive_nested_replacement
from app.routers.details_support import (
    details_inner_list_text as _details_inner_list_text,
    details_inner_page as _details_inner_page,
)
from app.routers.page_support import (
    opened_page_text as _opened_page_text,
    page_screen as _page_screen,
    pages_for_user as _pages_for_user,
    saved_pages_text as _saved_pages_text,
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

    def test_every_locale_translates_list_editor_keys(self):
        for language in TRANSLATIONS:
            if language == "ar":
                continue
            missing = set(LIST_UI_KEYS) - set(KEY_TRANSLATIONS.get(language, {}))
            self.assertFalse(missing, f"{language}: {sorted(missing)}")

    def test_every_locale_translates_rich_import_keys(self):
        for language in TRANSLATIONS:
            if language == "ar":
                continue
            missing = set(RICH_IMPORT_KEYS) - set(KEY_TRANSLATIONS.get(language, {}))
            self.assertFalse(missing, f"{language}: {sorted(missing)}")

    def test_every_locale_translates_details_inner_editor_keys(self):
        for language in TRANSLATIONS:
            if language == "ar":
                continue
            missing = set(DETAILS_INNER_KEYS) - set(KEY_TRANSLATIONS.get(language, {}))
            self.assertFalse(missing, f"{language}: {sorted(missing)}")

    def test_details_inner_overview_shows_names_and_live_positions(self):
        details = {
            "id": "details", "type": "details", "position": 0,
            "data": {"children": [
                {"id": "photo", "type": "photo", "position": 1, "data": {}},
                {"id": "text", "type": "paragraph", "position": 0, "data": {}},
            ]},
        }
        token = i18n_core._language.set("ar")
        try:
            overview = _details_inner_list_text(details)
            page = _details_inner_page(details, details["data"]["children"][1])
        finally:
            i18n_core._language.reset(token)

        self.assertLess(overview.index("1. 📝 فقرة"), overview.index("2. 🖼 صورة"))
        self.assertIn("الموقع داخل التفاصيل: 2 من 2", page)

    def test_imported_rich_message_overview_lists_blocks_in_order(self):
        blocks = [
            {"id": "photo", "type": "photo", "position": 1, "data": {}},
            {"id": "text", "type": "paragraph", "position": 0, "data": {}},
        ]
        token = i18n_core._language.set("ar")
        try:
            rendered = _editor_overview_text(blocks)
        finally:
            i18n_core._language.reset(token)

        self.assertIn("تم استيراد الرسالة الغنية", rendered)
        self.assertIn("عدد البلوكات: 2", rendered)
        self.assertLess(rendered.index("📝 فقرة"), rendered.index("🖼 صورة"))

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
    async def test_footer_is_inserted_directly_after_selected_inner_block(self):
        children = [
            {"id": "first", "type": "paragraph", "position": 0, "data": {}},
            {"id": "second", "type": "photo", "position": 1, "data": {}},
        ]
        details = {
            "id": "details", "type": "details", "position": 0,
            "data": {"children": children, "native": True, "native_data": {}},
        }
        data = {
            "blocks": [details], "nested_details_id": "details",
            "nested_child_id": "first", "nested_action": "add_footer",
        }
        message = SimpleNamespace(text="المصدر", html_text="المصدر")
        state = SimpleNamespace(update_data=AsyncMock(), set_state=AsyncMock())
        with (
            patch("app.routers.details_edit.delete_add_step_messages", AsyncMock()),
            patch("app.routers.details_edit.edit_saved_ui", AsyncMock()),
        ):
            handled = await _receive_nested_replacement(
                message, state, SimpleNamespace(), data,
            )

        self.assertTrue(handled)
        self.assertEqual(
            [child["type"] for child in details["data"]["children"]],
            ["paragraph", "footer", "photo"],
        )
        self.assertEqual(details["data"]["children"][1]["data"]["text"], "المصدر")
        self.assertFalse(details["data"]["native"])
        self.assertNotIn("native_data", details["data"])

    async def test_forwarded_rich_message_replaces_editor_source(self):
        old_blocks = [{"id": "old", "type": "paragraph", "position": 0}]
        new_blocks = [{"id": "new", "type": "photo", "position": 0}]
        message = SimpleNamespace(answer=AsyncMock())
        state = SimpleNamespace(
            get_data=AsyncMock(return_value={"blocks": old_blocks}),
            update_data=AsyncMock(),
        )
        bot = SimpleNamespace()
        with (
            patch(
                "app.routers.editor_preview.message_to_blocks",
                return_value=new_blocks,
            ),
            patch(
                "app.routers.editor_preview.delete_input_message",
                AsyncMock(),
            ) as delete_input,
            patch(
                "app.routers.editor_preview.edit_saved_ui",
                AsyncMock(),
            ) as edit_ui,
        ):
            await import_rich_message_into_editor(message, state, bot)

        updates = [call.kwargs for call in state.update_data.await_args_list]
        draft_update = next(update for update in updates if "blocks" in update)
        history_update = next(update for update in updates if UNDO_KEY in update)
        self.assertEqual(draft_update["blocks"][0]["id"], "new")
        self.assertEqual(draft_update["blocks"][0]["type"], "photo")
        self.assertEqual(draft_update["message_buttons"], [])
        self.assertEqual(history_update[UNDO_KEY][0]["blocks"][0]["id"], "old")
        delete_input.assert_awaited_once_with(message)
        edit_ui.assert_awaited_once()

    async def test_user_marker_offers_user_and_public_channel_choices(self):
        message = SimpleNamespace(answer=AsyncMock())
        state = SimpleNamespace(update_data=AsyncMock())

        await _ask_for_button_user(
            message,
            state,
            {"title": "الوجهة", "marker": "{الوجهة - USER}"},
        )

        keyboard = message.answer.await_args.kwargs["reply_markup"]
        self.assertIsNotNone(keyboard.keyboard[0][0].request_users)
        channel_request = keyboard.keyboard[1][0].request_chat
        self.assertTrue(channel_request.chat_is_channel)
        self.assertTrue(channel_request.chat_has_username)
        stored = state.update_data.await_args.kwargs
        self.assertNotEqual(
            stored["pending_user_request_id"],
            stored["pending_chat_request_id"],
        )

    async def test_pages_can_be_searched_and_sorted_by_latest_update(self):
        pages = [
            {"page_id": "a", "title": "Alpha", "updated_at": 10},
            {"page_id": "b", "title": "Beta", "updated_at": 30},
            {"page_id": "c", "title": "Other", "updated_at": 50},
        ]
        with patch(
            "app.routers.page_support.page_registry.list_for_user",
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

        self.assertEqual(session[1], [])
        self.assertEqual(session[0]["blocks"], [])
        self.assertEqual(session[0]["message_buttons"], [])
        self.assertEqual(session[0]["buttons_per_row"], 1)
        callback.answer.assert_not_awaited()

    async def test_editor_command_opens_an_empty_editor_immediately(self):
        sent = SimpleNamespace(chat=SimpleNamespace(id=10), message_id=20)
        bot = SimpleNamespace(send_rich_message=AsyncMock(return_value=sent))
        message = SimpleNamespace(
            answer=AsyncMock(return_value=sent),
            bot=bot,
            chat=SimpleNamespace(id=10),
        )
        state = SimpleNamespace(
            clear=AsyncMock(),
            set_state=AsyncMock(),
            update_data=AsyncMock(),
        )

        await new_editor(message, state)

        state.clear.assert_awaited_once()
        bot.send_rich_message.assert_awaited_once()
        message.answer.assert_not_awaited()
        rich_message = bot.send_rich_message.await_args.kwargs["rich_message"]
        self.assertEqual(rich_message.blocks[1].type, "details")
        self.assertEqual(state.update_data.await_count, 2)
        self.assertEqual(state.update_data.await_args_list[0].kwargs["blocks"], [])

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

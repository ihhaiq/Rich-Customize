from __future__ import annotations

import re
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app import i18n_core
from app.editor.draft_store import EditorDraft
from app.editor.models import make_block
from app.i18n import t
from app.keyboards.editor import build_result_keyboard, build_welcome_keyboard
from app.lang import KEY_TRANSLATIONS, SUPPORTED_LANGUAGES
from app.routers.button_target_picker import complete_button_target
from app.routers.details_edit import receive_nested_replacement
from app.routers.editor_navigation import back_to_main
from app.routers.page_actions import open_saved_page
from app.routers.page_support import saved_pages_text


ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


class _DummyMessage:
    def __init__(self, message_id: int = 20, chat_id: int = 10) -> None:
        self.message_id = message_id
        self.chat = SimpleNamespace(id=chat_id)
        self.delete = AsyncMock()


class UserPickerResumeTests(unittest.IsolatedAsyncioTestCase):
    async def test_edit_resume_does_not_require_pending_blocks_or_clear_session(self):
        marker = "{Profile - USER}"
        final_state = {
            "blocks": [
                make_block("paragraph", {"text": marker, "html": marker}),
            ],
        }
        state = SimpleNamespace(
            clear=AsyncMock(),
            set_data=AsyncMock(),
            set_state=AsyncMock(),
            get_data=AsyncMock(return_value=final_state),
        )
        message = SimpleNamespace(answer=AsyncMock(), bot=SimpleNamespace())
        data = {
            "blocks": [make_block("paragraph", {"text": "old", "html": "old"})],
            "current_block_id": "old",
            "expected_type": "paragraph",
            "pending_user_markers": [{"marker": marker, "title": "Profile"}],
            "pending_user_marker_index": 0,
            "pending_user_resume": "editing_block",
            "pending_user_message": {"message_id": 1},
            "pending_user_resolutions": [],
        }
        resumed = AsyncMock()
        with (
            patch("app.routers.button_target_picker.Message.model_validate", return_value=SimpleNamespace()),
            patch("app.routers.block_edit.receive_replacement", resumed),
        ):
            await complete_button_target(message, state, data, 42, "demo_user")

        state.clear.assert_not_awaited()
        resumed.assert_awaited_once()
        persisted = state.set_data.await_args_list[-1].args[0]
        self.assertIn("https://t.me/demo_user", str(persisted))

    async def test_details_add_resume_returns_to_details_builder(self):
        marker = "{Profile - USER}"
        state = SimpleNamespace(
            clear=AsyncMock(),
            set_data=AsyncMock(),
            set_state=AsyncMock(),
            get_data=AsyncMock(return_value={"add_payload": {"summary_html": marker}}),
        )
        message = SimpleNamespace(answer=AsyncMock(), bot=SimpleNamespace())
        data = {
            "blocks": [],
            "pending_add_type": "details",
            "add_step": "details_summary",
            "add_payload": {},
            "pending_user_markers": [{"marker": marker, "title": "Profile"}],
            "pending_user_marker_index": 0,
            "pending_user_resume": "adding_block",
            "pending_user_message": {"message_id": 1},
            "pending_user_resolutions": [],
        }
        details_resume = AsyncMock()
        generic_resume = AsyncMock()
        with (
            patch("app.routers.button_target_picker.Message.model_validate", return_value=SimpleNamespace()),
            patch("app.routers.details_builder.receive_details_add", details_resume),
            patch("app.routers.block_add.receive_added_block", generic_resume),
        ):
            await complete_button_target(message, state, data, 42, "demo_user")

        state.clear.assert_not_awaited()
        details_resume.assert_awaited_once()
        generic_resume.assert_not_awaited()


class DetailsEditingTests(unittest.IsolatedAsyncioTestCase):
    async def test_nested_paragraph_accepts_normal_formatted_telegram_text(self):
        child = make_block("paragraph", {"text": "old", "html": "old"})
        details = make_block(
            "details",
            {"summary_html": "Details", "children": [child]},
        )
        data = {
            "blocks": [details],
            "nested_details_id": details["id"],
            "nested_child_id": child["id"],
            "nested_action": "content",
            "expected_type": "paragraph",
        }
        message = SimpleNamespace(
            text="new text",
            html_text="<i>new text</i>",
            entities=[],
            media_group_id=None,
            location=None,
        )
        state = SimpleNamespace(
            update_data=AsyncMock(),
            set_state=AsyncMock(),
        )
        with (
            patch("app.routers.details_edit.remember", AsyncMock()),
            patch("app.routers.details_edit.save_document", AsyncMock()),
            patch("app.routers.details_edit.delete_add_step_messages", AsyncMock()),
            patch("app.routers.details_edit.edit_saved_ui", AsyncMock()),
            patch("app.routers.details_edit.details_inner_page", return_value="details"),
            patch("app.routers.details_edit.build_details_inner_block_keyboard", return_value=None),
        ):
            handled = await receive_nested_replacement(
                message,
                state,
                SimpleNamespace(),
                data,
            )

        self.assertTrue(handled)
        updated = details["data"]["children"][0]
        self.assertEqual(updated["type"], "paragraph")
        self.assertEqual(updated["data"]["text"], "new text")
        self.assertEqual(updated["data"]["html"], "<i>new text</i>")


class SavedPageSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_open_page_does_not_parse_user_title_as_html(self):
        message = _DummyMessage()
        callback = SimpleNamespace(
            message=message,
            data="r:pageopen:p1",
            from_user=SimpleNamespace(id=7),
            answer=AsyncMock(),
        )
        state = SimpleNamespace(
            set_state=AsyncMock(),
            update_data=AsyncMock(),
        )
        before = EditorDraft(blocks=[], message_buttons=[])
        page = {
            "page_id": "p1",
            "owner_id": 7,
            "title": "<b>A & B</b>",
            "blocks": [],
            "buttons": [],
            "buttons_per_row": 1,
            "buttons_align": "center",
        }
        edit = AsyncMock()
        with (
            patch("app.routers.page_actions.Message", _DummyMessage),
            patch("app.routers.page_actions.page_registry.get", AsyncMock(return_value=page)),
            patch("app.routers.page_actions.draft_store.load", AsyncMock(return_value=before)),
            patch("app.routers.page_actions.persist_page_draft_change", AsyncMock()),
            patch("app.routers.page_actions.edit_ui", edit),
        ):
            await open_saved_page(callback, state)

        edit.assert_awaited_once()
        args = edit.await_args.args
        kwargs = edit.await_args.kwargs
        self.assertIn("<b>A & B</b>", args[1])
        self.assertIsNone(kwargs.get("parse_mode"))


class PreviewRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_back_from_transient_error_returns_to_canonical_panel(self):
        transient = _DummyMessage(message_id=200, chat_id=10)
        callback = SimpleNamespace(
            message=transient,
            from_user=SimpleNamespace(id=7),
            answer=AsyncMock(),
        )
        blocks = [make_block("paragraph", {"text": "hello", "html": "hello"})]
        data = {
            "blocks": blocks,
            "management_chat_id": 10,
            "management_message_id": 99,
            "block_scroll_offset": 0,
        }
        draft = EditorDraft(blocks=blocks, message_buttons=[])
        state = SimpleNamespace(
            update_data=AsyncMock(),
            set_state=AsyncMock(),
        )
        edit_saved = AsyncMock()
        with (
            patch("app.routers.editor_navigation.Message", _DummyMessage),
            patch("app.routers.editor_navigation.load_editor_session", AsyncMock(return_value=(data, blocks))),
            patch("app.routers.editor_navigation.delete_stored_block_prompt", AsyncMock()),
            patch("app.routers.editor_navigation.draft_store.load", AsyncMock(return_value=draft)),
            patch("app.routers.editor_navigation.edit_saved_ui", edit_saved),
            patch("app.routers.editor_navigation.managed_chat_registry.clear_panel", AsyncMock()),
        ):
            await back_to_main(callback, state, SimpleNamespace())

        transient.delete.assert_awaited_once()
        edit_saved.assert_awaited_once()
        self.assertIs(edit_saved.await_args.args[1], state)


class CoreLocalizationRegressionTests(unittest.TestCase):
    def test_new_semantic_editor_keys_cover_every_supported_locale(self):
        required = {"editor.showcase_button", "editor.current_position"}
        for language in sorted(SUPPORTED_LANGUAGES - {"ar", "en"}):
            missing = required - set(KEY_TRANSLATIONS.get(language, {}))
            self.assertFalse(missing, f"{language}: {sorted(missing)}")

    def test_russian_core_editor_controls_do_not_leak_arabic(self):
        token = i18n_core._language.set("ru")
        try:
            welcome = build_welcome_keyboard()
            result = build_result_keyboard()
            pages = saved_pages_text()
            values = [
                welcome.inline_keyboard[0][0].text,
                welcome.inline_keyboard[0][1].text,
                result.inline_keyboard[0][0].text,
                pages,
                t("editor.current_position"),
            ]
        finally:
            i18n_core._language.reset(token)

        for value in values:
            self.assertIsNone(ARABIC_RE.search(value), value)

    def test_french_saved_pages_screen_tests_the_real_renderer(self):
        token = i18n_core._language.set("fr")
        try:
            rendered = saved_pages_text(1, 3)
        finally:
            i18n_core._language.reset(token)

        self.assertIn("2/3", rendered)
        self.assertIsNone(ARABIC_RE.search(rendered))


if __name__ == "__main__":
    unittest.main()

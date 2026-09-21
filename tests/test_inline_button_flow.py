from __future__ import annotations

import copy
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app import i18n_core
from app.editor.builders import new_block
from app.editor.history import UNDO_KEY
from app.keyboards.message_buttons import build_message_buttons_keyboard
from app.routers.button_create import start_add_button
from app.routers.button_input import receive_button_value
from app.routers.button_manager import open_buttons_manager
from app.routers.button_preview_actions import show_popup_button
from app.routers.button_support import prepare_message_buttons, preview_buttons
from app.routers.page_delivery import saved_page_query_result
from app.services.buttons import MAX_BUTTONS, add_message_button, parse_message_button_spec
from app.services.renderer import (
    edit_rich_message_page, send_rich_message_post, send_rich_message_preview,
)
from app.states import RichEditorStates


class FakeState:
    def __init__(self):
        self.data = {
            "blocks": [new_block("paragraph", {"text": "Original content"})],
            "message_buttons": [], "buttons_per_row": 2, "buttons_align": "center",
            "block_scroll_offset": 0,
            "pending_button_action": "add_spec",
            "management_chat_id": 1, "management_message_id": 10,
        }
        self.state = RichEditorStates.editing_button

    async def get_data(self):
        return copy.deepcopy(self.data)

    async def update_data(self, **kwargs):
        self.data.update(copy.deepcopy(kwargs))

    async def set_state(self, state):
        self.state = state


class FakeMessage:
    def __init__(self, text=""):
        self.text = text
        self.from_user = SimpleNamespace(id=1)
        self.chat = SimpleNamespace(id=1)
        self.message_id = 10
        self.answer = AsyncMock()
        self.edit_text = AsyncMock()
        self.delete = AsyncMock()


class InlineButtonInputTests(unittest.IsolatedAsyncioTestCase):
    async def test_add_opens_one_plain_prompt_and_back_cancels(self):
        state, message = FakeState(), FakeMessage()
        callback = SimpleNamespace(message=message, answer=AsyncMock())
        token = i18n_core._language.set("ar")
        try:
            with patch("app.routers.button_create.Message", FakeMessage):
                await start_add_button(callback, state)
            prompt = message.edit_text.await_args.args[0]
            self.assertIn("أرسل تنسيق الزر", prompt)
            self.assertIn("{ اسم الزر -", prompt)
            self.assertNotIn("دليل", prompt)
            self.assertNotIn("rich_message", message.edit_text.await_args.kwargs)
            keyboard = message.edit_text.await_args.kwargs["reply_markup"]
            self.assertEqual(keyboard.inline_keyboard[0][0].callback_data, "r:buttons")
            self.assertEqual(state.data["pending_button_action"], "add_spec")
            self.assertEqual(state.state, RichEditorStates.editing_button)
            message.answer.assert_not_awaited()

            with patch("app.routers.button_manager.Message", FakeMessage):
                await open_buttons_manager(callback, state)
            self.assertIsNone(state.data["pending_button_action"])
            self.assertEqual(state.state, RichEditorStates.managing)
            self.assertEqual(state.data["message_buttons"], [])
        finally:
            i18n_core._language.reset(token)

    async def test_one_submission_adds_keyboard_button_and_returns_to_manager(self):
        cases = (
            ("{ قناتي - https://t.me/Rich_archive }", "url", "https://t.me/Rich_archive"),
            ("{ تنبيه - alert: مرحبًا بالجميع }", "popup", "مرحبًا بالجميع"),
            ("{ تنبيه - popup: " + "ن" * 200 + " }", "popup", "ن" * 200),
            ("{ الصفحة - cBd:deadbeef }", "page", "deadbeef"),
            ("{ نسخ - copy: النص المنسوخ }", "copy", "النص المنسوخ"),
            ("{ تنفيذ - callback_data: " + "ن" * 32 + " }", "callback_data", "ن" * 32),
        )
        for specification, button_type, expected in cases:
            with self.subTest(button_type=button_type, specification=specification):
                state, message = FakeState(), FakeMessage(specification)
                original_blocks = copy.deepcopy(state.data["blocks"])
                bot = SimpleNamespace(edit_message_text=AsyncMock())
                with patch("app.routers.button_input.page_registry.get", AsyncMock(return_value={"owner_id": 1})):
                    await receive_button_value(message, state, bot)
                button = state.data["message_buttons"][0]
                self.assertEqual((button["type"], button["value"]), (button_type, expected))
                self.assertEqual(button["style"], "default")
                self.assertEqual(state.data["blocks"], original_blocks)
                self.assertEqual(len(state.data[UNDO_KEY]), 1)
                self.assertEqual(state.state, RichEditorStates.managing)
                self.assertIsNone(state.data["pending_button_action"])
                message.answer.assert_not_awaited()
                message.delete.assert_awaited_once()
                arguments = bot.edit_message_text.await_args.kwargs
                self.assertNotIn("rich_message", arguments)
                callbacks = [b.callback_data for row in arguments["reply_markup"].inline_keyboard for b in row]
                self.assertIn("r:ba", callbacks)
                self.assertFalse(any((value or "").startswith("r:bsc:") for value in callbacks))
                keyboard = build_message_buttons_keyboard(state.data["message_buttons"])
                self.assertIsInstance(keyboard.inline_keyboard[0][0], InlineKeyboardButton)

    async def test_invalid_input_and_foreign_pages_leave_draft_unchanged(self):
        invalid = (
            "قناتي - https://t.me/Rich_archive",
            "{ - https://example.com }", "{ اسم - popup: }",
            "{ اسم - https://example.com } { آخر - alert:نص }",
            "{ اسم - richbtn:نص }", "{ اسم - USER }",
            "{ اسم - https://[broken }", "{ اسم - https://example.com extra }",
            "{ اسم - callback_data:" + "ن" * 33 + " }",
            "{ اسم - popup:" + "ن" * 201 + " }",
            "{ " + "س" * 65 + " - https://example.com }",
            "{ اسم - cbd:missing }", "{ اسم - cbd:foreign }",
        )
        for specification in invalid:
            with self.subTest(specification=specification):
                state, message = FakeState(), FakeMessage(specification)
                before = copy.deepcopy(state.data)
                bot = SimpleNamespace(edit_message_text=AsyncMock())
                page = {"owner_id": 2} if "foreign" in specification else None
                with patch("app.routers.button_input.page_registry.get", AsyncMock(return_value=page)):
                    await receive_button_value(message, state, bot)
                self.assertEqual(state.data, before)
                self.assertEqual(state.state, RichEditorStates.editing_button)
                message.answer.assert_awaited_once()
                bot.edit_message_text.assert_not_awaited()

    async def test_button_limit_prevents_starting_creation(self):
        state, message = FakeState(), FakeMessage()
        state.data["message_buttons"] = [{"id": str(i), "text": "Button", "position": i} for i in range(MAX_BUTTONS)]
        callback = SimpleNamespace(message=message, answer=AsyncMock())
        with patch("app.routers.button_create.Message", FakeMessage):
            await start_add_button(callback, state)
        message.edit_text.assert_not_awaited()
        self.assertTrue(callback.answer.await_args.kwargs["show_alert"])

    async def test_popup_uses_registry_token_and_preserves_full_text(self):
        buttons = []
        text = "تنبيه طويل " * 18
        add_message_button(buttons, "تنبيه", text, "popup")
        remember, get = AsyncMock(), AsyncMock(return_value=text)
        with patch("app.routers.button_support.popup_registry.remember", remember):
            prepared = await prepare_message_buttons(buttons)
        callback_data = build_message_buttons_keyboard(prepared).inline_keyboard[0][0].callback_data
        self.assertLessEqual(len(callback_data.encode()), 64)
        remember.assert_awaited_once_with(prepared[0]["popup_token"], text)
        callback = SimpleNamespace(data=callback_data, answer=AsyncMock())
        with patch("app.routers.button_preview_actions.popup_registry.get", get):
            await show_popup_button(callback)
        callback.answer.assert_awaited_once_with(text, show_alert=True)


class InlineButtonDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.blocks = [new_block("paragraph", {"text": "Content"})]
        self.buttons = []
        add_message_button(self.buttons, "قناتي", "https://t.me/Rich_archive")
        add_message_button(self.buttons, "الصفحة", "deadbeef", "page")

    def assert_keyboard_payload(self, arguments):
        rich = arguments["rich_message"].model_dump(mode="json", exclude_none=True)
        self.assertEqual([block["type"] for block in rich["blocks"]], ["paragraph"])
        keyboard = arguments["reply_markup"]
        self.assertEqual(len(keyboard.inline_keyboard[0]), 2)
        self.assertEqual(keyboard.inline_keyboard[0][0].url, "https://t.me/Rich_archive")
        self.assertEqual(keyboard.inline_keyboard[0][1].callback_data, "r:page:deadbeef:source")

    async def test_post_preview_and_page_edit_send_real_inline_keyboards(self):
        for delivery in (send_rich_message_post, send_rich_message_preview, edit_rich_message_page):
            with self.subTest(delivery=delivery.__name__):
                bot = SimpleNamespace(send_rich_message=AsyncMock(), send_rich_message_draft=AsyncMock(), edit_message_text=AsyncMock())
                kwargs = {"message_id": 10} if delivery is edit_rich_message_page else {}
                await delivery(bot, 1, blocks=self.blocks, buttons=self.buttons, buttons_per_row=2, source_page_id="source", **kwargs)
                method = bot.edit_message_text if kwargs else bot.send_rich_message
                self.assert_keyboard_payload(method.await_args.kwargs)

    async def test_saved_inline_and_guest_result_keep_buttons_outside_rich_content(self):
        page = {"blocks": self.blocks, "buttons": self.buttons, "buttons_per_row": 2, "title": "Saved"}
        with patch("app.routers.page_delivery.page_registry.get", AsyncMock(return_value=page)):
            result = await saved_page_query_result("source")
        self.assert_keyboard_payload({"rich_message": result.input_message_content.rich_message, "reply_markup": result.reply_markup})

    async def test_post_keeps_extra_controls_and_page_edit_clears_old_keyboard(self):
        bot = SimpleNamespace(send_rich_message=AsyncMock(), edit_message_text=AsyncMock())
        extra = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Back", callback_data="back")]])
        await send_rich_message_post(bot, 1, self.blocks, self.buttons, reply_markup=extra)
        keyboard = bot.send_rich_message.await_args.kwargs["reply_markup"]
        self.assertEqual(keyboard.inline_keyboard[-1][0].callback_data, "back")
        await edit_rich_message_page(bot, 1, 10, self.blocks, [])
        self.assertEqual(bot.edit_message_text.await_args.kwargs["reply_markup"].inline_keyboard, [])

    async def test_buttons_only_preview_has_no_rich_guide(self):
        bot = SimpleNamespace(send_message=AsyncMock(), send_rich_message=AsyncMock())
        await preview_buttons(bot, 1, self.buttons, 2)
        bot.send_rich_message.assert_not_awaited()
        keyboard = bot.send_message.await_args.kwargs["reply_markup"]
        self.assertEqual(keyboard.inline_keyboard[0][0].url, "https://t.me/Rich_archive")
        self.assertEqual(keyboard.inline_keyboard[-1][0].callback_data, "r:bpback")

    async def test_cbd_keyboard_preserves_source_and_navigation_session(self):
        self.buttons[1]["audience"] = "subscribers"
        keyboard = build_message_buttons_keyboard(self.buttons, source_page_id="page-two", navigation_token="abcdef123456")
        self.assertEqual(keyboard.inline_keyboard[1][0].callback_data, "r:spage:deadbeef:page-two:abcdef123456")


class InlineButtonSyntaxTests(unittest.TestCase):
    def test_hyphens_fragments_and_popup_content_are_not_reinterpreted(self):
        cases = (
            ("{ Git-Hub - https://example.com/a-b?q=c-d#r }", ("Git-Hub", "url", "https://example.com/a-b?q=c-d#r")),
            ("{ Notice - alert: hello - world #r all }", ("Notice", "popup", "hello - world #r all")),
            ("{اسم–cbd:page-one}", ("اسم", "page", "page-one")),
        )
        for text, expected in cases:
            self.assertEqual(parse_message_button_spec(text), expected)

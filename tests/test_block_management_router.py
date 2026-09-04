from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from aiogram.types import Chat, Message, User

from app.editor.models import make_block
from app.editor.workflow import editor_workflow
from app.routers.block_add import receive_added_block
from app.routers.block_edit import receive_replacement
from app.routers.block_keyboard import build_managed_block_keyboard
from app.routers.block_management import router as block_management_router
from app.keyboards import build_table_display_keyboard, build_table_options_keyboard
from app.services.blocks import set_table_cell_style
from app.services.renderer import build_input_rich_message


class BlockManagementDomainTests(unittest.TestCase):
    def test_received_native_table_can_be_edited_without_losing_rows(self):
        block = make_block(
            "table",
            {"native_data": {"type": "table", "cells": [[{"text": "old"}]]}},
            source="native",
        )

        self.assertTrue(set_table_cell_style(block, 0, 0, shaded=True))
        self.assertEqual(block["source"], "generated")
        self.assertEqual(block["data"]["rows"][0][0]["text"], "old")
        self.assertTrue(block["data"]["rows"][0][0]["is_header"])
        self.assertNotIn("native_data", block["data"])

    def test_table_options_expose_display_settings(self):
        keyboard = build_table_options_keyboard("table-one")
        callbacks = {
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data
        }
        self.assertIn("r:tdisplay:table-one", callbacks)

    def test_table_display_settings_and_renderer_include_compact_mode(self):
        block = make_block("table", {
            "rows": [["one", "two"]],
            "is_bordered": False,
            "is_striped": True,
            "is_compact": True,
        }, block_id="table-one")
        callbacks = {
            button.callback_data
            for row in build_table_display_keyboard(block).inline_keyboard
            for button in row
            if button.callback_data
        }
        self.assertEqual(
            {callback for callback in callbacks if callback.startswith("r:ttoggle:")},
            {
                "r:ttoggle:table-one:is_bordered",
                "r:ttoggle:table-one:is_striped",
                "r:ttoggle:table-one:is_compact",
            },
        )
        rendered = build_input_rich_message([block]).model_dump(
            mode="json", exclude_none=True,
        )["blocks"][0]
        self.assertNotIn("is_bordered", rendered)
        self.assertTrue(rendered["is_striped"])
        self.assertTrue(rendered["is_compact"])

    def test_duplicate_creates_new_id_directly_after_source(self):
        first = make_block("paragraph", {"text": "one"})
        second = make_block("footer", {"text": "two"})
        result = editor_workflow.duplicate([first, second], first["id"])

        self.assertTrue(result.changed)
        self.assertIsNotNone(result.block)
        assert result.block is not None
        self.assertNotEqual(result.block["id"], first["id"])
        self.assertEqual(result.block["type"], first["type"])
        self.assertEqual(result.block["data"], first["data"])
        self.assertEqual([block["position"] for block in result.blocks], [0, 1, 2])
        self.assertEqual(result.blocks[1]["id"], result.block["id"])

    def test_duplicate_preserves_native_payload_without_sharing_identity(self):
        original = make_block(
            "mathematical_expression",
            {"native_data": {"type": "mathematical_expression", "expression": "x^2"}},
            source="native",
        )
        result = editor_workflow.duplicate([original], original["id"])

        assert result.block is not None
        self.assertEqual(result.block["source"], "native")
        self.assertEqual(result.block["data"]["native_data"], original["data"]["native_data"])
        self.assertIsNot(result.block["data"]["native_data"], original["data"]["native_data"])

    def test_managed_keyboard_exposes_duplicate_action(self):
        block = make_block("paragraph", {"text": "hello"})
        keyboard = build_managed_block_keyboard(block, [block])
        callbacks = {
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data
        }
        self.assertIn(f"r:dup:{block['id']}", callbacks)


class NativeTableInputTests(unittest.IsolatedAsyncioTestCase):
    async def test_add_table_accepts_a_ready_native_table(self):
        message = Message.model_validate({
            "message_id": 1,
            "date": datetime.now(timezone.utc),
            "chat": Chat(id=1, type="private"),
            "from_user": User(id=1, is_bot=False, first_name="Test"),
            "rich_message": {
                "blocks": [{
                    "type": "table",
                    "cells": [[
                        {"text": "Name", "align": "left", "valign": "middle"},
                        {"text": "Age", "align": "center", "valign": "middle"},
                    ]],
                    "is_bordered": True,
                    "is_striped": True,
                }],
            },
        })
        state = AsyncMock()
        state.get_data.return_value = {
            "pending_add_type": "table",
            "add_step": "content",
            "add_payload": {},
        }
        bot = AsyncMock()

        with (
            patch(
                "app.routers.block_add.defer_text_for_user_buttons",
                new=AsyncMock(return_value=False),
            ),
            patch("app.routers.block_add.finish_add", new=AsyncMock()) as finish_add,
        ):
            await receive_added_block(message, state, bot)

        added = finish_add.await_args.args[3]
        self.assertEqual(added["type"], "table")
        self.assertEqual(added["source"], "native")
        self.assertEqual(added["data"]["native_data"]["cells"][0][1]["text"], "Age")
        self.assertTrue(added["data"]["native_data"]["is_striped"])


class BlockManagementRouterTests(unittest.TestCase):
    @staticmethod
    def _registered_names(router, observer_name):
        observer = getattr(router, observer_name)
        names = [handler.callback.__name__ for handler in observer.handlers]
        for child in router.sub_routers:
            names.extend(BlockManagementRouterTests._registered_names(child, observer_name))
        return names

    def test_aggregator_contains_only_feature_routers(self):
        self.assertEqual(
            {child.name for child in block_management_router.sub_routers},
            {"block_add", "block_actions", "block_table", "block_edit"},
        )
        self.assertFalse(hasattr(block_management_router, "legacy_module"))

    def test_real_router_registers_each_block_input_handler_once(self):
        from app.routers import rich_editor

        names = self._registered_names(rich_editor.router, "message")
        self.assertEqual(names.count(receive_added_block.__name__), 1)
        self.assertEqual(names.count(receive_replacement.__name__), 1)
        self.assertNotIn("rich_editor", {child.name for child in rich_editor.router.sub_routers})


if __name__ == "__main__":
    unittest.main()

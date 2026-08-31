from __future__ import annotations

import unittest
from types import SimpleNamespace

from aiogram import F, Router

from app.editor.models import make_block
from app.editor.workflow import editor_workflow
from app.routers.block_add import receive_added_block
from app.routers.block_edit import receive_replacement
from app.routers.block_keyboard import build_managed_block_keyboard
from app.routers.block_management import (
    LEGACY_BLOCK_CALLBACKS,
    LEGACY_BLOCK_MESSAGES,
    detach_legacy_block_handlers,
    legacy_block_handlers,
)


class BlockManagementDomainTests(unittest.TestCase):
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
        self.assertEqual(
            [block["position"] for block in result.blocks],
            [0, 1, 2],
        )
        self.assertEqual(result.blocks[1]["id"], result.block["id"])

    def test_duplicate_preserves_native_payload_without_sharing_identity(self):
        original = make_block(
            "mathematical_expression",
            {
                "native_data": {
                    "type": "mathematical_expression",
                    "expression": "x^2",
                }
            },
            source="native",
        )
        result = editor_workflow.duplicate([original], original["id"])

        assert result.block is not None
        self.assertEqual(result.block["source"], "native")
        self.assertEqual(
            result.block["data"]["native_data"],
            original["data"]["native_data"],
        )
        self.assertIsNot(
            result.block["data"]["native_data"],
            original["data"]["native_data"],
        )

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


class BlockManagementLegacyTests(unittest.TestCase):
    def test_legacy_block_handlers_are_detached_by_name(self):
        legacy = SimpleNamespace(router=Router(name="legacy-block-test"))

        async def ordinary_callback(*args, **kwargs):
            return None

        async def ordinary_message(*args, **kwargs):
            return None

        legacy.router.callback_query.register(
            ordinary_callback,
            F.data == "r:ordinary",
        )
        legacy.router.message.register(ordinary_message)

        for index, name in enumerate(sorted(LEGACY_BLOCK_CALLBACKS)):
            async def callback(*args, **kwargs):
                return None
            callback.__name__ = name
            legacy.router.callback_query.register(
                callback,
                F.data == f"r:legacy-block:{index}",
            )

        for name in sorted(LEGACY_BLOCK_MESSAGES):
            async def message_handler(*args, **kwargs):
                return None
            message_handler.__name__ = name
            legacy.router.message.register(message_handler)

        removed = detach_legacy_block_handlers(legacy)

        self.assertEqual(
            set(removed["callback_query"]),
            set(LEGACY_BLOCK_CALLBACKS),
        )
        self.assertEqual(
            set(removed["message"]),
            set(LEGACY_BLOCK_MESSAGES),
        )
        self.assertEqual(
            legacy_block_handlers(legacy),
            {"callback_query": (), "message": ()},
        )
        callback_names = {
            getattr(handler.callback, "__name__", "")
            for handler in legacy.router.callback_query.handlers
        }
        message_names = {
            getattr(handler.callback, "__name__", "")
            for handler in legacy.router.message.handlers
        }
        self.assertIn("ordinary_callback", callback_names)
        self.assertIn("ordinary_message", message_names)

    def test_real_router_has_block_handlers_without_legacy_fallback(self):
        from app.routers import rich_editor

        names = []
        stack = [rich_editor.router]
        while stack:
            current = stack.pop()
            names.extend(
                handler.callback.__name__
                for handler in current.message.handlers
            )
            stack.extend(current.sub_routers)
        self.assertEqual(names.count(receive_added_block.__name__), 1)
        self.assertEqual(names.count(receive_replacement.__name__), 1)
        self.assertNotIn(
            "rich_editor",
            {child.name for child in rich_editor.router.sub_routers},
        )


if __name__ == "__main__":
    unittest.main()

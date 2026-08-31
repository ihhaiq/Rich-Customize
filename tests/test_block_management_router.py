from __future__ import annotations

import unittest

from app.editor.models import make_block
from app.editor.workflow import editor_workflow
from app.routers.block_add import receive_added_block
from app.routers.block_edit import receive_replacement
from app.routers.block_keyboard import build_managed_block_keyboard
from app.routers.block_management import router as block_management_router


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

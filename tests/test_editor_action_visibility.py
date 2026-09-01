import unittest

from aiogram.enums import ButtonStyle

from app import i18n_core
from app.keyboards.blocks import build_add_block_keyboard
from app.keyboards.editor import build_editor_tools_keyboard, build_rich_editor_keyboard


class EditorActionVisibilityTests(unittest.TestCase):
    @staticmethod
    def _callbacks(keyboard) -> dict[str, object]:
        return {
            button.callback_data: button
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data
        }

    def test_single_block_hides_undo_and_save_page_from_main_panel(self):
        keyboard = build_rich_editor_keyboard([
            {"id": "b1", "type": "paragraph", "position": 0, "data": {}},
        ])
        callbacks = self._callbacks(keyboard)

        self.assertNotIn("r:undo", callbacks)
        self.assertNotIn("r:redo", callbacks)
        self.assertNotIn("r:savepage", callbacks)
        self.assertIn("r:tools", callbacks)
        self.assertIn("r:result", callbacks)
        self.assertIn("r:addmenu", callbacks)
        self.assertIn("r:post", callbacks)

    def test_two_or_more_blocks_show_undo(self):
        keyboard = build_rich_editor_keyboard([
            {"id": "b1", "type": "paragraph", "position": 0, "data": {}},
            {"id": "b2", "type": "divider", "position": 1, "data": {}},
        ])
        callbacks = self._callbacks(keyboard)

        self.assertIn("r:undo", callbacks)
        self.assertIn("r:redo", callbacks)
        self.assertNotIn("r:savepage", callbacks)
        history_row = next(
            row for row in keyboard.inline_keyboard
            if any(button.callback_data == "r:undo" for button in row)
        )
        self.assertEqual(
            [button.callback_data for button in history_row[:2]],
            ["r:undo", "r:redo"],
        )

    def test_save_page_is_available_inside_more_tools(self):
        token = i18n_core._language.set("ar")
        try:
            keyboard = build_editor_tools_keyboard()
        finally:
            i18n_core._language.reset(token)
        callbacks = self._callbacks(keyboard)

        self.assertIn("r:pages", callbacks)
        self.assertIn("r:buttons", callbacks)
        self.assertIn("r:savepage", callbacks)
        self.assertEqual(callbacks["r:savepage"].text, "💾 حفظ الصفحة")
        self.assertEqual(callbacks["r:savepage"].style, ButtonStyle.SUCCESS)

    def test_thinking_is_not_a_user_addable_block(self):
        keyboard = build_add_block_keyboard()
        callbacks = [
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data
        ]
        labels = [
            button.text
            for row in keyboard.inline_keyboard
            for button in row
        ]

        self.assertNotIn("r:add:thinking", callbacks)
        self.assertFalse(any("Thinking" in label for label in labels))


if __name__ == "__main__":
    unittest.main()

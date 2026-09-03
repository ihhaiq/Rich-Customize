import unittest

from aiogram.enums import ButtonStyle

from app import i18n_core
from app.keyboards.blocks import build_add_block_keyboard
from app.keyboards.editor import (
    BLOCK_SCROLL_SIZE,
    build_editor_tools_keyboard,
    build_rich_editor_keyboard,
)


class EditorActionVisibilityTests(unittest.TestCase):
    @staticmethod
    def _callbacks(keyboard) -> dict[str, object]:
        return {
            button.callback_data: button
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data
        }

    @staticmethod
    def _blocks(count: int) -> list[dict[str, object]]:
        return [
            {"id": f"b{index + 1}", "type": "paragraph", "position": index, "data": {}}
            for index in range(count)
        ]

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
        self.assertEqual(callbacks["r:tools"].style, ButtonStyle.PRIMARY)

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
        history_index = keyboard.inline_keyboard.index(history_row)
        tools_row = keyboard.inline_keyboard[history_index + 1]
        self.assertEqual([button.callback_data for button in tools_row], ["r:tools"])
        self.assertEqual(tools_row[0].style, ButtonStyle.PRIMARY)

    def test_block_list_uses_one_scroll_button_on_first_chunk(self):
        keyboard = build_rich_editor_keyboard(self._blocks(BLOCK_SCROLL_SIZE + 1))
        callbacks = self._callbacks(keyboard)

        self.assertIn(f"r:blockscroll:{BLOCK_SCROLL_SIZE}", callbacks)
        self.assertNotIn("r:blockscroll:0", callbacks)
        visible_blocks = [
            callback
            for callback in callbacks
            if callback.startswith("r:b:")
        ]
        self.assertEqual(len(visible_blocks), BLOCK_SCROLL_SIZE)

    def test_scrolled_chunk_places_up_above_blocks_and_scroll_below(self):
        keyboard = build_rich_editor_keyboard(
            self._blocks(BLOCK_SCROLL_SIZE * 2 + 1),
            block_offset=BLOCK_SCROLL_SIZE,
        )

        self.assertEqual(
            keyboard.inline_keyboard[0][0].callback_data,
            "r:blockscroll:0",
        )
        block_rows = [
            row for row in keyboard.inline_keyboard
            if row[0].callback_data and row[0].callback_data.startswith("r:b:")
        ]
        self.assertEqual(len(block_rows), BLOCK_SCROLL_SIZE)
        last_block_index = keyboard.inline_keyboard.index(block_rows[-1])
        self.assertEqual(
            keyboard.inline_keyboard[last_block_index + 1][0].callback_data,
            f"r:blockscroll:{BLOCK_SCROLL_SIZE * 2}",
        )

    def test_last_chunk_only_keeps_up_button_above_blocks(self):
        keyboard = build_rich_editor_keyboard(
            self._blocks(BLOCK_SCROLL_SIZE * 2 + 1),
            block_offset=BLOCK_SCROLL_SIZE * 2,
        )
        callbacks = self._callbacks(keyboard)

        self.assertEqual(
            keyboard.inline_keyboard[0][0].callback_data,
            f"r:blockscroll:{BLOCK_SCROLL_SIZE}",
        )
        self.assertNotIn(f"r:blockscroll:{BLOCK_SCROLL_SIZE * 3}", callbacks)
        visible_blocks = [
            callback
            for callback in callbacks
            if callback.startswith("r:b:")
        ]
        self.assertEqual(visible_blocks, [f"r:b:b{BLOCK_SCROLL_SIZE * 2 + 1}"])

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

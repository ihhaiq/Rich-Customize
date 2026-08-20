import unittest

from app.keyboards import (
    build_details_content_keyboard, build_inner_block_keyboard,
    build_message_buttons_keyboard, build_post_chats_keyboard,
)
from app.services.buttons import add_message_button


class ButtonKeyboardTests(unittest.TestCase):
    def test_button_types_and_two_per_row(self):
        buttons = []
        add_message_button(buttons, "رابط", "https://t.me/ihhai", "url")
        add_message_button(buttons, "نسخ", "النص المنسوخ", "copy")
        popup = add_message_button(buttons, "تنبيه", "نص التنبيه", "popup")

        keyboard = build_message_buttons_keyboard(buttons, buttons_per_row=2)

        self.assertEqual([len(row) for row in keyboard.inline_keyboard], [2, 1])
        self.assertEqual(keyboard.inline_keyboard[0][0].url, "https://t.me/ihhai")
        self.assertEqual(keyboard.inline_keyboard[0][1].copy_text.text, "النص المنسوخ")
        self.assertEqual(
            keyboard.inline_keyboard[1][0].callback_data,
            f"r:popup:{popup['id']}",
        )

    def test_multiple_chat_selection(self):
        chats = [
            {"chat_id": -1001, "title": "القناة", "type": "channel"},
            {"chat_id": -1002, "title": "المجموعة", "type": "supergroup"},
        ]
        keyboard = build_post_chats_keyboard(
            chats,
            "https://t.me/bot?startchannel",
            "https://t.me/bot?startgroup",
            [-1002],
        )
        self.assertTrue(keyboard.inline_keyboard[0][0].text.startswith("⬜"))
        self.assertTrue(keyboard.inline_keyboard[1][0].text.startswith("✅"))
        self.assertIn("(1)", keyboard.inline_keyboard[2][0].text)

    def test_details_builder_only_finishes_after_an_inner_block(self):
        empty = build_details_content_keyboard(0)
        populated = build_details_content_keyboard(2)

        self.assertEqual(empty.inline_keyboard[0][0].callback_data, "r:details:add")
        self.assertFalse(any(
            button.callback_data == "r:details:finish"
            for row in empty.inline_keyboard for button in row
        ))
        self.assertTrue(any(
            button.callback_data == "r:details:finish"
            for row in populated.inline_keyboard for button in row
        ))

    def test_inner_block_menu_uses_container_compatibility(self):
        details = build_inner_block_keyboard("details")
        callbacks = {
            button.callback_data
            for row in details.inline_keyboard for button in row
        }
        self.assertIn("r:details:type:list", callbacks)
        self.assertIn("r:details:type:mathematical_expression", callbacks)
        self.assertNotIn("r:details:type:details", callbacks)

        math = build_inner_block_keyboard("mathematical_expression")
        self.assertEqual(
            [button.callback_data for row in math.inline_keyboard for button in row],
            ["r:details:content"],
        )


if __name__ == "__main__":
    unittest.main()

import unittest

from aiogram.enums import ButtonStyle

from app.keyboards import (
    build_post_chats_keyboard,
    build_post_confirmation_keyboard,
    build_post_settings_keyboard,
)


class PublishingKeyboardStyleTests(unittest.TestCase):
    def test_chat_picker_uses_two_column_rich_grid_and_state_styles(self):
        chats = [
            {"chat_id": -1001, "title": "القناة", "type": "channel"},
            {"chat_id": -1002, "title": "المجموعة", "type": "supergroup"},
            {"chat_id": -1003, "title": "مجموعة ثانية", "type": "supergroup"},
        ]

        keyboard = build_post_chats_keyboard(
            chats,
            "https://t.me/bot?startchannel",
            "https://t.me/bot?startgroup",
            [-1002],
        )

        first_row = keyboard.inline_keyboard[0]
        second_row = keyboard.inline_keyboard[1]
        self.assertEqual(len(first_row), 2)
        self.assertEqual(len(second_row), 1)

        unselected = first_row[0]
        selected = first_row[1]
        self.assertTrue(unselected.text.startswith("⚪"))
        self.assertEqual(unselected.style, ButtonStyle.PRIMARY)
        self.assertTrue(selected.text.startswith("🟢"))
        self.assertEqual(selected.style, ButtonStyle.SUCCESS)

        back = keyboard.inline_keyboard[-1][0]
        self.assertEqual(back.callback_data, "r:back")
        self.assertIsNone(back.style)

    def test_publish_settings_are_rich_except_back(self):
        keyboard = build_post_settings_keyboard(
            silent=False,
            protected=True,
            selected_count=2,
        )

        silent = keyboard.inline_keyboard[0][0]
        protected = keyboard.inline_keyboard[1][0]
        send = keyboard.inline_keyboard[2][0]
        back = keyboard.inline_keyboard[3][0]

        self.assertEqual(silent.style, ButtonStyle.PRIMARY)
        self.assertEqual(protected.style, ButtonStyle.SUCCESS)
        self.assertEqual(send.style, ButtonStyle.SUCCESS)
        self.assertIsNone(back.style)

    def test_confirmation_cancel_is_rich(self):
        keyboard = build_post_confirmation_keyboard(2)

        confirm = keyboard.inline_keyboard[0][0]
        cancel = keyboard.inline_keyboard[1][0]
        self.assertEqual(confirm.style, ButtonStyle.SUCCESS)
        self.assertEqual(cancel.style, ButtonStyle.DANGER)


if __name__ == "__main__":
    unittest.main()

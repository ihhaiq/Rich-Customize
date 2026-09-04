import unittest

from aiogram.enums import ButtonStyle

from app.keyboards import build_post_chats_keyboard


class PublishingKeyboardStyleTests(unittest.TestCase):
    def test_chat_picker_uses_rich_state_buttons_and_transparent_back(self):
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

        unselected = keyboard.inline_keyboard[0][0]
        selected = keyboard.inline_keyboard[1][0]
        settings = keyboard.inline_keyboard[2][0]
        add_channel, add_group = keyboard.inline_keyboard[-2]
        back = keyboard.inline_keyboard[-1][0]

        self.assertTrue(unselected.text.startswith("⬜"))
        self.assertEqual(unselected.style, ButtonStyle.PRIMARY)
        self.assertTrue(selected.text.startswith("✅"))
        self.assertEqual(selected.style, ButtonStyle.SUCCESS)
        self.assertEqual(settings.style, ButtonStyle.SUCCESS)
        self.assertEqual(add_channel.style, ButtonStyle.PRIMARY)
        self.assertEqual(add_group.style, ButtonStyle.PRIMARY)
        self.assertEqual(back.callback_data, "r:back")
        self.assertIsNone(back.style)


if __name__ == "__main__":
    unittest.main()

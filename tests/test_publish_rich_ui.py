import unittest

from app.keyboards import build_post_back_keyboard
from app.services.publish_ui import (
    build_post_confirmation_rich_message,
    build_post_picker_rich_message,
    build_post_settings_rich_message,
)


def _type_value(value):
    return str(getattr(value, "value", value))


class PublishRichUiTests(unittest.TestCase):
    def test_picker_chat_names_use_full_width_button_rows(self):
        chats = [
            {"chat_id": -1001, "title": "GH | العراقيون العرب AR", "type": "channel"},
            {"chat_id": -1002, "title": "المجموعة", "type": "supergroup"},
        ]
        rich = build_post_picker_rich_message(
            "إنشاء منشور",
            chats,
            "https://t.me/bot?startchannel",
            "https://t.me/bot?startgroup",
            [-1002],
        )

        self.assertEqual(len(rich.blocks), 4)
        unselected_row = rich.blocks[1]
        selected_row = rich.blocks[2]
        table = rich.blocks[3]

        self.assertEqual(_type_value(unselected_row.type), "buttons")
        self.assertEqual(_type_value(selected_row.type), "buttons")
        self.assertEqual(unselected_row.align, "center")
        self.assertEqual(selected_row.align, "center")

        unselected = unselected_row.buttons[0]
        selected = selected_row.buttons[0]
        self.assertEqual(str(unselected.text), "⬜ 📢 GH | العراقيون العرب AR")
        self.assertEqual(unselected.callback_data, "r:postchat:-1001")
        self.assertEqual(unselected.style, "primary")

        self.assertTrue(str(selected.text).startswith("✅"))
        self.assertEqual(selected.callback_data, "r:postchat:-1002")
        self.assertEqual(selected.style, "success")

        self.assertEqual(_type_value(table.type), "table")
        self.assertTrue(table.is_bordered)

        settings = table.cells[0][0].text
        add_channel = table.cells[1][0].text
        add_group = table.cells[1][1].text

        self.assertEqual(settings.button.callback_data, "r:postsettings")
        self.assertEqual(settings.button.style, "success")
        self.assertEqual(add_channel.button.url, "https://t.me/bot?startchannel")
        self.assertEqual(add_group.button.url, "https://t.me/bot?startgroup")

    def test_settings_controls_are_rich_buttons_and_back_is_inline_only(self):
        rich = build_post_settings_rich_message(
            "إعدادات المنشور",
            silent=False,
            protected=True,
            selected_count=2,
        )
        table = rich.blocks[1]
        silent = table.cells[0][0].text.button
        protected = table.cells[1][0].text.button
        send = table.cells[2][0].text.button

        self.assertEqual(silent.callback_data, "r:pt:silent")
        self.assertEqual(silent.style, "primary")
        self.assertEqual(protected.callback_data, "r:pt:protected")
        self.assertEqual(protected.style, "success")
        self.assertEqual(send.callback_data, "r:postconfirm")
        self.assertEqual(send.style, "success")

        back = build_post_back_keyboard("r:postlist").inline_keyboard[0][0]
        self.assertEqual(back.callback_data, "r:postlist")
        self.assertIsNone(back.style)

    def test_confirmation_keeps_only_confirm_in_rich_table(self):
        rich = build_post_confirmation_rich_message("تأكيد النشر")
        confirm = rich.blocks[1].cells[0][0].text.button
        self.assertEqual(confirm.callback_data, "r:postsend")
        self.assertEqual(confirm.style, "success")

        back = build_post_back_keyboard("r:postsettings").inline_keyboard[0][0]
        self.assertEqual(back.callback_data, "r:postsettings")
        self.assertIsNone(back.style)


if __name__ == "__main__":
    unittest.main()

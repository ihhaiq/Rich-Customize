import unittest

from app.i18n import use_language
from app.keyboards import build_post_back_keyboard
from app.lang import SUPPORTED_LANGUAGES
from app.services.publish_ui import (
    build_post_confirmation_rich_message,
    build_post_picker_rich_message,
    build_post_settings_rich_message,
)


def _type_value(value):
    return str(getattr(value, "value", value))


class PublishRichUiTests(unittest.TestCase):
    def test_picker_separates_chat_names_from_selection_controls(self):
        chats = [
            {
                "chat_id": -1001234567890,
                "title": "GH | العراقيون العرب AR",
                "type": "channel",
                "username": "iraqi_arab",
            },
            {
                "chat_id": -1009876543210,
                "title": "المجموعة",
                "type": "supergroup",
            },
        ]
        with use_language("ar"):
            rich = build_post_picker_rich_message(
                "إنشاء منشور",
                chats,
                "https://t.me/bot?startchannel",
                "https://t.me/bot?startgroup",
                [-1009876543210],
            )

        self.assertEqual(len(rich.blocks), 2)
        table = rich.blocks[1]
        self.assertEqual(_type_value(table.type), "table")
        self.assertTrue(table.is_bordered)

        unselected_name = table.cells[0][0].text.button
        selected_name = table.cells[1][0].text.button
        unselected = table.cells[0][1].text.button
        selected = table.cells[1][1].text.button

        self.assertEqual(unselected_name.text, "📢 GH | العراقيون العرب AR")
        self.assertNotIn("⬜", str(unselected_name.text))
        self.assertEqual(unselected_name.url, "https://t.me/iraqi_arab")
        self.assertIsNone(unselected_name.callback_data)
        self.assertEqual(unselected.text, "⬜ تحديد")
        self.assertEqual(unselected.callback_data, "r:postchat:-1001234567890")
        self.assertEqual(unselected.style, "primary")

        self.assertEqual(selected_name.text, "👥 المجموعة")
        self.assertNotIn("✅", str(selected_name.text))
        self.assertEqual(selected_name.url, "https://t.me/c/9876543210/1")
        self.assertIsNone(selected_name.callback_data)
        self.assertEqual(selected.text, "✅ تحديد")
        self.assertEqual(selected.callback_data, "r:postchat:-1009876543210")
        self.assertEqual(selected.style, "success")

        settings = table.cells[2][0].text
        add_channel = table.cells[3][0].text
        add_group = table.cells[3][1].text

        self.assertEqual(settings.button.callback_data, "r:postsettings")
        self.assertEqual(settings.button.style, "success")
        self.assertEqual(add_channel.button.url, "https://t.me/bot?startchannel")
        self.assertEqual(add_group.button.url, "https://t.me/bot?startgroup")

    def test_picker_selection_label_is_localized_for_every_language(self):
        chats = [{"chat_id": -1001, "title": "Channel", "type": "channel"}]
        labels: dict[str, str] = {}

        for language in SUPPORTED_LANGUAGES:
            with use_language(language):
                rich = build_post_picker_rich_message(
                    "Create post",
                    chats,
                    "https://t.me/bot?startchannel",
                    "https://t.me/bot?startgroup",
                )
            labels[language] = str(rich.blocks[1].cells[0][1].text.button.text)

        self.assertEqual(labels["ar"], "⬜ تحديد")
        self.assertEqual(labels["en"], "⬜ Select")
        for language in SUPPORTED_LANGUAGES - {"en"}:
            self.assertNotEqual(labels[language], "⬜ Select")

    def test_picker_name_button_links_basic_groups(self):
        rich = build_post_picker_rich_message(
            "Create post",
            [{"chat_id": -123456789, "title": "Group", "type": "group"}],
            "https://t.me/bot?startchannel",
            "https://t.me/bot?startgroup",
        )

        name = rich.blocks[1].cells[0][0].text.button
        self.assertEqual(name.text, "👥 Group")
        self.assertEqual(name.url, "tg://openmessage?chat_id=123456789")
        self.assertIsNone(name.callback_data)

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

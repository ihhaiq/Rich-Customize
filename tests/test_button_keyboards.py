import unittest

from aiogram.enums import ButtonStyle

from app.keyboards import (
    build_button_type_keyboard, build_buttons_manager_keyboard,
    build_details_content_keyboard, build_inner_block_keyboard,
    build_message_buttons_keyboard, build_post_chats_keyboard,
    build_pages_keyboard, build_page_target_keyboard,
    build_rich_editor_keyboard,
    build_start_editor_keyboard,
    build_welcome_keyboard,
)
from app.services.buttons import add_message_button


class ButtonKeyboardTests(unittest.TestCase):
    def test_empty_editor_starts_with_add_block_and_pages(self):
        keyboard = build_rich_editor_keyboard([])
        callbacks = [
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
        ]

        self.assertEqual(callbacks, ["r:pages", "r:addmenu"])

    def test_start_editor_button_uses_expected_callback(self):
        keyboard = build_start_editor_keyboard()
        button = keyboard.inline_keyboard[0][0]

        self.assertEqual(button.callback_data, "r:starteditor")
        self.assertTrue(button.text)

    def test_welcome_places_start_editor_next_to_showcase(self):
        keyboard = build_welcome_keyboard()
        callbacks = [button.callback_data for button in keyboard.inline_keyboard[0]]

        self.assertEqual(callbacks, ["r:showcase", "r:starteditor"])

    def test_button_manager_can_change_button_type(self):
        buttons = []
        button = add_message_button(buttons, "زر", "https://example.com", "url")
        manager = build_buttons_manager_keyboard(buttons)
        callbacks = {
            item.callback_data
            for row in manager.inline_keyboard for item in row
        }
        self.assertIn("r:bs:type", callbacks)

        picker = build_button_type_keyboard(f"r:bct:{button['id']}")
        picker_callbacks = {
            item.callback_data
            for row in picker.inline_keyboard for item in row
        }
        self.assertIn(f"r:bct:{button['id']}:disabled", picker_callbacks)
        self.assertIn(f"r:bct:{button['id']}:callback_data", picker_callbacks)

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

    def test_saved_pages_are_selected_by_name(self):
        pages = [{"page_id": "a1b2c3d4", "title": "الصفحة الثانية"}]

        own_pages = build_pages_keyboard(pages)
        add_target = build_page_target_keyboard(pages, "add")
        change_target = build_page_target_keyboard(pages, "change", "button1")

        self.assertEqual(own_pages.inline_keyboard[0][0].text, "📄 الصفحة الثانية")
        self.assertEqual(
            add_target.inline_keyboard[0][0].callback_data,
            "r:bpg:add:a1b2c3d4",
        )
        self.assertEqual(
            change_target.inline_keyboard[0][0].callback_data,
            "r:bpg:change:button1:a1b2c3d4",
        )

    def test_saved_pages_offer_copy_rename_and_delete_actions(self):
        keyboard = build_pages_keyboard(
            [{"page_id": "a1b2c3d4", "title": "صفحة مهمة"}],
            page_index=2,
            total_pages=4,
        )
        open_button = keyboard.inline_keyboard[0][0]
        copy_button, rename_button, delete_button = keyboard.inline_keyboard[1]
        previous_button, counter_button, next_button = keyboard.inline_keyboard[2]

        self.assertEqual(open_button.style, ButtonStyle.PRIMARY)
        self.assertEqual(copy_button.copy_text.text, "a1b2c3d4")
        self.assertEqual(copy_button.style, ButtonStyle.SUCCESS)
        self.assertEqual(rename_button.callback_data, "r:prename:a1b2c3d4:2")
        self.assertEqual(delete_button.callback_data, "r:pdelete:a1b2c3d4:2")
        self.assertEqual(delete_button.style, ButtonStyle.DANGER)
        self.assertEqual(previous_button.callback_data, "r:pages:1")
        self.assertEqual(counter_button.text, "3/4")
        self.assertEqual(next_button.callback_data, "r:pages:3")

    def test_editor_uses_color_only_for_final_actions(self):
        keyboard = build_rich_editor_keyboard([
            {"id": "b1", "type": "paragraph", "position": 0, "data": {}},
        ])
        by_callback = {
            button.callback_data: button
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data
        }

        self.assertIsNone(by_callback["r:addmenu"].style)
        self.assertIsNone(by_callback["r:buttons"].style)
        self.assertIsNone(by_callback["r:savepage"].style)
        self.assertIsNone(by_callback["r:pages"].style)
        self.assertEqual(by_callback["r:post"].style, ButtonStyle.PRIMARY)
        self.assertEqual(by_callback["r:result"].style, ButtonStyle.SUCCESS)

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

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import EditMessageText

from app.i18n import t, use_language
from app.keyboards import build_pages_keyboard
from app.lang import SUPPORTED_LANGUAGES
from app.routers.page_support import render_pages_screen, saved_pages_text
from app.services.pages_ui import build_pages_rich_message


class PagesRichLayoutTests(unittest.TestCase):
    def test_compact_table_uses_header_and_one_row_per_page(self):
        pages = [
            {"page_id": "first", "title": "الصفحة <الأولى> & عنوان طويل " * 2},
            {"page_id": "second", "title": "Second"},
        ]
        with use_language("ar"):
            rich = build_pages_rich_message(saved_pages_text(), pages)

        self.assertEqual(
            [block.type for block in rich.blocks],
            ["paragraph", "divider", "table", "divider"],
        )
        table = rich.blocks[2]
        self.assertTrue(table.is_bordered)
        self.assertTrue(table.is_compact)
        self.assertEqual([len(row) for row in table.cells], [4, 4, 4])

        header = table.cells[0]
        self.assertTrue(all(cell.is_header for cell in header))
        self.assertEqual([cell.text for cell in header[:2]], ["🗑️", "✏️"])
        self.assertEqual(header[2].text, "نسخ الكود")
        self.assertEqual(header[3].align, "right")

        for index, page in enumerate(pages, start=1):
            row = table.cells[index]
            self.assertEqual([cell.colspan for cell in row], [None, None, None, None])
            self.assertEqual([cell.text.button.text for cell in row[:3]], ["🗑️", "✏️", "نسخ الكود"])
            self.assertEqual(row[2].text.button.copy_text.text, page["page_id"])
            self.assertIsNone(row[2].text.button.callback_data)
            self.assertEqual(row[3].text.button.text, page["title"])
            self.assertEqual(row[3].align, "right")

    def test_pager_is_outside_table_and_uses_current_over_total(self):
        for index, total in ((0, 1), (0, 3), (1, 3), (2, 3), (11, 13)):
            with self.subTest(index=index, total=total):
                rich = build_pages_rich_message("Pages", [{"page_id": "code"}], index)
                self.assertEqual(len(rich.blocks[2].cells), 2)

                keyboard = build_pages_keyboard(
                    show_pager=True,
                    page_index=index,
                    total_pages=total,
                )
                previous, counter, following = keyboard.inline_keyboard[0]
                self.assertEqual(counter.text, f"{index + 1}/{total}")
                self.assertEqual(
                    previous.callback_data,
                    f"r:pages:{max(index - 1, 0)}",
                )
                self.assertEqual(
                    counter.callback_data,
                    f"r:pages:{index}",
                )
                self.assertEqual(
                    following.callback_data,
                    f"r:pages:{min(index + 1, total - 1)}",
                )

    def test_copy_label_is_localized_without_translating_user_titles_or_codes(self):
        title = "Choose a page to open and edit: < & >"
        for language in SUPPORTED_LANGUAGES:
            with self.subTest(language=language), use_language(language):
                rich = build_pages_rich_message(
                    saved_pages_text(), [{"page_id": "abc12345", "title": title}],
                )
                rows = rich.blocks[2].cells
                self.assertEqual(rows[1][3].text.button.text, title)
                copy = rows[1][2].text.button
                self.assertEqual(copy.copy_text.text, "abc12345")
                self.assertEqual(copy.text, t("pages.copy_code"))
                self.assertNotEqual(copy.text, "pages.copy_code")
                if language != "en":
                    self.assertNotEqual(copy.text, "Copy code")


class PagesRichScreenTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.bot = SimpleNamespace(edit_message_text=AsyncMock(), send_rich_message=AsyncMock())
        self.message = SimpleNamespace(bot=self.bot, chat=SimpleNamespace(id=10), message_id=99)
        self.data = {"management_chat_id": 10, "management_message_id": 20}
        self.state = SimpleNamespace(
            get_data=AsyncMock(side_effect=lambda: dict(self.data)), update_data=AsyncMock(),
        )
        self.pages = [{"page_id": "code", "title": "Page"}]

    async def test_search_and_sort_keep_their_context_and_edit_the_saved_panel(self):
        self.data.update(pages_search_query="< & >", pages_sort_mode="title")
        with patch(
            "app.routers.page_support.query_user_pages",
            AsyncMock(return_value=(self.pages, self.pages, 1, 3, 12)),
        ) as query:
            rendered = await render_pages_screen(self.message, self.state, 7, 1, saved=True)

        self.assertTrue(rendered)
        query.assert_awaited_once_with(7, 1, "< & >", "title")
        sent = self.bot.edit_message_text.await_args.kwargs
        self.assertEqual((sent["chat_id"], sent["message_id"]), (10, 20))
        self.assertNotIn("text", sent)
        self.assertNotIn("parse_mode", sent)
        rich = sent["rich_message"]
        self.assertIn("< & >", rich.blocks[0].text)
        pager = sent["reply_markup"].inline_keyboard[0]
        previous, counter, following = pager
        self.assertEqual([button.text for button in pager], ["⬅️", "2/3", "➡️"])
        self.assertEqual(previous.callback_data, "r:presults:0")
        self.assertEqual(counter.callback_data, "r:presults:1")
        self.assertEqual(following.callback_data, "r:presults:2")
        self.assertEqual(
            [button.callback_data for row in sent["reply_markup"].inline_keyboard for button in row],
            [
                "r:presults:0", "r:presults:1", "r:presults:2",
                "r:psearch", "r:psort", "r:back",
            ],
        )
        self.bot.send_rich_message.assert_not_awaited()

    async def test_empty_search_shows_the_query_without_an_invalid_empty_table(self):
        self.data["pages_search_query"] = "<missing>"
        with patch(
            "app.routers.page_support.query_user_pages", AsyncMock(return_value=([], [], 0, 1, 4)),
        ):
            self.assertTrue(await render_pages_screen(self.message, self.state, 7))
        sent = self.bot.edit_message_text.await_args.kwargs
        self.assertEqual(sent["message_id"], 99)
        self.assertEqual([block.type for block in sent["rich_message"].blocks], ["paragraph"])
        self.assertIn("<missing>", sent["rich_message"].blocks[0].text)
        self.assertEqual(len(sent["reply_markup"].inline_keyboard), 2)

    async def test_no_saved_pages_keeps_the_existing_empty_state(self):
        with patch(
            "app.routers.page_support.query_user_pages", AsyncMock(return_value=([], [], 0, 1, 0)),
        ):
            self.assertFalse(await render_pages_screen(self.message, self.state, 7))
        self.bot.edit_message_text.assert_not_awaited()
        self.bot.send_rich_message.assert_not_awaited()

    async def test_missing_saved_panel_is_replaced_with_a_rich_message(self):
        self.bot.edit_message_text.side_effect = TelegramBadRequest(
            method=EditMessageText(text="old"), message="Bad Request: message to edit not found",
        )
        self.bot.send_rich_message.return_value = SimpleNamespace(
            chat=SimpleNamespace(id=10), message_id=100,
        )
        with patch(
            "app.routers.page_support.query_user_pages",
            AsyncMock(return_value=(self.pages, self.pages, 0, 1, 1)),
        ):
            await render_pages_screen(self.message, self.state, 7, saved=True)
        self.bot.send_rich_message.assert_awaited_once()
        self.assertEqual(
            self.bot.send_rich_message.await_args.kwargs["rich_message"].blocks[2].type, "table",
        )
        self.state.update_data.assert_awaited_once_with(
            management_chat_id=10, management_message_id=100,
        )

    async def test_unchanged_panel_does_not_send_a_duplicate_message(self):
        self.bot.edit_message_text.side_effect = TelegramBadRequest(
            method=EditMessageText(text="old"), message="Bad Request: message is not modified",
        )
        with patch(
            "app.routers.page_support.query_user_pages",
            AsyncMock(return_value=(self.pages, self.pages, 0, 1, 1)),
        ):
            await render_pages_screen(self.message, self.state, 7, saved=True)
        self.bot.send_rich_message.assert_not_awaited()
        self.state.update_data.assert_not_awaited()

    async def test_invalid_rich_payload_is_not_retried_as_a_new_message(self):
        self.bot.edit_message_text.side_effect = TelegramBadRequest(
            method=EditMessageText(text="old"), message="Bad Request: RICH_MESSAGE_EMPTY",
        )
        with patch(
            "app.routers.page_support.query_user_pages",
            AsyncMock(return_value=(self.pages, self.pages, 0, 1, 1)),
        ), self.assertRaises(TelegramBadRequest):
            await render_pages_screen(self.message, self.state, 7, saved=True)
        self.bot.send_rich_message.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()

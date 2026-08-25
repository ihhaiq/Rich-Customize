import unittest
from datetime import datetime, timezone

from aiogram.types import Chat, Message, MessageEntity, User

from app.services.factory import details_data, new_block, table_data
from app.services.buttons import add_message_button
from app.services.parser import message_to_blocks
from app.services.renderer import build_input_rich_message
from app.services.inline_buttons import (
    find_user_button_markers, resolve_user_button_marker,
)


class FormattedTextParserTests(unittest.TestCase):
    def test_inline_url_and_callback_buttons_keep_their_text_position(self):
        paragraph = new_block("paragraph", {
            "text": "قبل {الموقع:url https://example.com#p} وسط {نفذ:callback_data action:1#r} بعد",
            "html": "<p>قبل {الموقع:url https://example.com#p} وسط {نفذ:callback_data action:1#r} بعد</p>",
        })
        rich = build_input_rich_message([paragraph]).model_dump(mode="json", exclude_none=True)
        text = rich["blocks"][0]["text"]

        self.assertEqual(text[0], "قبل ")
        self.assertEqual(text[1]["type"], "button")
        self.assertEqual(text[1]["button"]["url"], "https://example.com")
        self.assertEqual(text[1]["button"]["style"], "primary")
        self.assertEqual(text[3]["button"]["callback_data"], "action:1")
        self.assertEqual(text[3]["button"]["style"], "danger")
        self.assertEqual(text[4], " بعد")

    def test_user_marker_is_resolved_before_rendering(self):
        marker = "{حساب حسين:user#g}"
        blocks = [new_block("paragraph", {
            "text": f"قبل {marker} بعد",
            "html": f"<p>قبل {marker} بعد</p>",
        })]
        markers = find_user_button_markers(blocks[0]["data"]["text"])
        self.assertEqual(markers[0]["title"], "حساب حسين")

        resolve_user_button_marker(blocks, marker, 123456789)
        rich = build_input_rich_message(blocks).model_dump(mode="json", exclude_none=True)
        button = rich["blocks"][0]["text"][1]["button"]

        self.assertEqual(button["url"], "tg://user?id=123456789")
        self.assertEqual(button["style"], "success")

    def test_bot_api_10_3_rich_buttons_are_embedded_as_blocks(self):
        paragraph = new_block("paragraph", {"text": "النص", "html": "<p>النص</p>"})
        buttons = []
        url = add_message_button(buttons, "الموقع", "https://t.me/ihhai", "url")
        copy = add_message_button(buttons, "نسخ", "قيمة", "copy")
        popup = add_message_button(buttons, "تنبيه", "مرحبًا", "popup")
        disabled = add_message_button(buttons, "متوقف", "", "disabled")
        assert url and copy and popup and disabled
        url["style"] = "primary"
        popup["style"] = "link"

        rich = build_input_rich_message(
            [paragraph], buttons, buttons_per_row=2, buttons_align="right",
        ).model_dump(mode="json", exclude_none=True)

        self.assertEqual(
            [block["type"] for block in rich["blocks"]],
            ["paragraph", "buttons", "buttons"],
        )
        self.assertEqual(rich["blocks"][1]["align"], "right")
        self.assertEqual(rich["blocks"][1]["buttons"][0]["style"], "primary")
        self.assertEqual(rich["blocks"][1]["buttons"][1]["copy_text"]["text"], "قيمة")
        self.assertEqual(rich["blocks"][2]["buttons"][0]["style"], "link")
        self.assertTrue(rich["blocks"][2]["buttons"][0]["callback_data"].startswith("r:popup:"))
        self.assertEqual(rich["blocks"][2]["buttons"][1]["disabled"], {})

    def test_document_is_a_native_rich_block(self):
        document = new_block("document", {
            "file": {"file_id": "document-file-id", "file_name": "report.pdf"},
            "caption_html": "التقرير",
        })
        rich = build_input_rich_message([document]).model_dump(mode="json", exclude_none=True)

        self.assertEqual(rich["blocks"][0]["type"], "document")
        self.assertEqual(rich["blocks"][0]["document"]["media"], "document-file-id")
        self.assertEqual(rich["blocks"][0]["caption"]["text"], "التقرير")

    def test_pullquote_media_is_nested_inside_a_block_quotation(self):
        photo = new_block("photo", {"file": {"file_id": "photo-file-id"}})
        pullquote = new_block("pullquote", {
            "quote_text": "النص",
            "quote_html": "النص",
            "credit_html": "الكاتب",
            "media_children": [photo],
        })
        rich = build_input_rich_message([pullquote]).model_dump(mode="json", exclude_none=True)

        quote = rich["blocks"][0]
        self.assertEqual(quote["type"], "blockquote")
        self.assertEqual([block["type"] for block in quote["blocks"]], ["photo", "paragraph"])
        self.assertEqual(quote["blocks"][1]["text"], "النص")
        self.assertEqual(quote["credit"], "الكاتب")

    def test_blockquote_media_is_nested_inside_the_quotation(self):
        photo = new_block("photo", {"file": {"file_id": "photo-file-id"}})
        blockquote = new_block("blockquote", {
            "quote_text": "وصف الصورة",
            "quote_html": "وصف الصورة",
            "media_children": [photo],
        })

        rich = build_input_rich_message([blockquote]).model_dump(
            mode="json", exclude_none=True,
        )
        quote = rich["blocks"][0]

        self.assertEqual(quote["type"], "blockquote")
        self.assertEqual(
            [block["type"] for block in quote["blocks"]],
            ["photo", "paragraph"],
        )

    def test_single_cell_row_automatically_spans_table_width(self):
        data = table_data("النص\nالخلية | الخلية")
        table = new_block("table", data)

        rich = build_input_rich_message([table]).model_dump(
            mode="json", exclude_none=True,
        )
        first_row = rich["blocks"][0]["cells"][0]

        self.assertEqual(len(first_row), 1)
        self.assertEqual(first_row[0]["colspan"], 2)

    def test_single_column_table_does_not_add_redundant_colspan(self):
        data = table_data("الأول\nالثاني")
        self.assertEqual(data["rows"], [["الأول"], ["الثاني"]])

    def test_list_inside_details_survives_typed_rendering(self):
        child = new_block("list", {
            "items": ["الأول", "الثاني"],
            "text": "الأول\nالثاني",
            "html": "<ul><li>الأول</li><li>الثاني</li></ul>",
        })
        details = new_block("details", details_data("العنوان", [child]))

        rich = build_input_rich_message([details]).model_dump(
            mode="json", exclude_none=True,
        )
        nested = rich["blocks"][0]["blocks"]

        self.assertEqual(nested[0]["type"], "list")
        self.assertEqual(
            [item["blocks"][0]["text"] for item in nested[0]["items"]],
            ["الأول", "الثاني"],
        )

    def test_quote_inside_details_survives_typed_rendering(self):
        message = Message(
            message_id=1,
            date=datetime.now(timezone.utc),
            chat=Chat(id=1, type="private"),
            from_user=User(id=1, is_bot=False, first_name="Test"),
            text="قبل\nاقتباس غامق\nبعد",
            entities=[
                MessageEntity(type="blockquote", offset=4, length=11),
                MessageEntity(type="bold", offset=11, length=4),
            ],
        )

        children = message_to_blocks(message)
        self.assertEqual([block["type"] for block in children], ["text", "blockquote", "text"])
        self.assertIn("<b>غامق</b>", children[1]["data"]["quote_html"])

        details = new_block("details", details_data("عنوان", children))
        rich = build_input_rich_message([details]).model_dump(mode="json", exclude_none=True)
        nested = rich["blocks"][0]["blocks"]
        self.assertEqual([block["type"] for block in nested], ["paragraph", "blockquote", "paragraph"])


if __name__ == "__main__":
    unittest.main()

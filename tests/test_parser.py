import unittest
from datetime import datetime, timezone

from aiogram.types import Chat, Message, MessageEntity, User

from app.services.factory import details_data, new_block, table_data
from app.services.parser import message_to_blocks
from app.services.renderer import build_input_rich_message


class FormattedTextParserTests(unittest.TestCase):
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

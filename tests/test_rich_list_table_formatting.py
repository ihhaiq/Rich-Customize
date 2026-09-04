import unittest

from aiogram.types import MessageEntity

from app.editor.builders import list_data, new_block, table_data
from app.services.renderer import build_input_rich_message


def _utf16_offset(text: str, needle: str, start: int = 0) -> tuple[int, int]:
    index = text.index(needle, start)
    offset = len(text[:index].encode("utf-16-le")) // 2
    length = len(needle.encode("utf-16-le")) // 2
    return offset, length


class RichListTableFormattingTests(unittest.TestCase):
    def test_list_preserves_telegram_italic_and_spoiler_entities(self):
        text = "• 😀مائل\n• سر"
        italic_offset, italic_length = _utf16_offset(text, "مائل")
        spoiler_offset, spoiler_length = _utf16_offset(text, "سر")
        entities = [
            MessageEntity(
                type="italic",
                offset=italic_offset,
                length=italic_length,
            ),
            MessageEntity(
                type="spoiler",
                offset=spoiler_offset,
                length=spoiler_length,
            ),
        ]

        data = list_data(text, "bullet", entities)
        self.assertEqual(data["items"][0]["text"], "😀مائل")
        self.assertEqual(data["items"][0]["html"], "😀<i>مائل</i>")
        self.assertEqual(data["items"][1]["html"], "<tg-spoiler>سر</tg-spoiler>")

        rich = build_input_rich_message([
            new_block("list", data),
        ]).model_dump(mode="json", exclude_none=True)
        first = rich["blocks"][0]["items"][0]["blocks"][0]["text"]
        second = rich["blocks"][0]["items"][1]["blocks"][0]["text"]

        self.assertEqual(first[0], "😀")
        self.assertEqual(first[1], {"type": "italic", "text": "مائل"})
        self.assertEqual(second, {"type": "spoiler", "text": "سر"})

    def test_table_preserves_inline_formatting_per_cell(self):
        text = "عادي | مائل\nسر | رابط"
        italic_offset, italic_length = _utf16_offset(text, "مائل")
        spoiler_offset, spoiler_length = _utf16_offset(text, "سر")
        link_offset, link_length = _utf16_offset(text, "رابط")
        entities = [
            MessageEntity(
                type="italic",
                offset=italic_offset,
                length=italic_length,
            ),
            MessageEntity(
                type="spoiler",
                offset=spoiler_offset,
                length=spoiler_length,
            ),
            MessageEntity(
                type="text_link",
                offset=link_offset,
                length=link_length,
                url="https://example.com",
            ),
        ]

        data = table_data(text, entities)
        self.assertEqual(data["rows"][0][0], "عادي")
        self.assertEqual(data["rows"][0][1]["html"], "<i>مائل</i>")
        self.assertEqual(data["rows"][1][0]["html"], "<tg-spoiler>سر</tg-spoiler>")
        self.assertEqual(
            data["rows"][1][1]["html"],
            '<a href="https://example.com">رابط</a>',
        )

        rich = build_input_rich_message([
            new_block("table", data),
        ]).model_dump(mode="json", exclude_none=True)
        cells = rich["blocks"][0]["cells"]

        self.assertEqual(cells[0][0]["text"], "عادي")
        self.assertEqual(cells[0][1]["text"], {"type": "italic", "text": "مائل"})
        self.assertEqual(cells[1][0]["text"], {"type": "spoiler", "text": "سر"})
        self.assertEqual(
            cells[1][1]["text"],
            {"type": "url", "text": "رابط", "url": "https://example.com"},
        )

    def test_formatting_spanning_table_separator_is_clipped_to_each_cell(self):
        text = "يسار | يمين"
        line_length = len(text.encode("utf-16-le")) // 2
        data = table_data(
            text,
            [MessageEntity(type="bold", offset=0, length=line_length)],
        )

        rich = build_input_rich_message([
            new_block("table", data),
        ]).model_dump(mode="json", exclude_none=True)
        cells = rich["blocks"][0]["cells"][0]

        self.assertEqual(cells[0]["text"], {"type": "bold", "text": "يسار"})
        self.assertEqual(cells[1]["text"], {"type": "bold", "text": "يمين"})


if __name__ == "__main__":
    unittest.main()

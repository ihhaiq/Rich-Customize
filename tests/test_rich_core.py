import unittest

from app.services.renderer import (
    _RichTextHTMLParser,
    _html_rich_text,
    build_input_rich_message,
)
from app.services.rich_core import (
    html_to_rich,
    native_available,
    native_max_nesting,
    parse_inline_markers,
)


def document_blocks(count: int = 50, caption_size: int = 16):
    blocks = []
    for index in range(count):
        prefix = f"file-{index:02d}:"
        caption = prefix + ("x" * max(0, caption_size - len(prefix)))
        blocks.append({
            "id": f"document-{index:02d}",
            "type": "document",
            "position": index,
            "data": {
                "file": {
                    "file_id": f"telegram-file-id-{index:02d}",
                    "file_name": f"file-{index:02d}.bin",
                },
                "caption_text": caption,
                "caption_html": f"<b>{caption}</b>",
            },
        })
    return blocks


def table_block(rows: int = 4, columns: int = 50):
    cells = []
    for row in range(rows):
        current = []
        for column in range(columns):
            if row == 0 and column in {1, 2}:
                text = "duplicate"
            elif row == 1 and column in {10, 20}:
                text = ""
            else:
                text = f"r{row}c{column}"
            current.append({"text": text, "html": f"<b>{text}</b>" if text else ""})
        cells.append(current)
    return [{
        "id": "table-50-columns",
        "type": "table",
        "position": 0,
        "data": {"rows": cells, "is_compact": True},
    }]


@unittest.skipUnless(native_available(), "Rust rich core extension is not installed")
class NativeRichCoreTests(unittest.TestCase):
    def test_inline_marker_offsets_and_metadata_preserve_unicode(self):
        text = "قبل {نسخ - CoPy : النص - GrEeN} بعد"
        parsed = parse_inline_markers(text)

        self.assertIsNotNone(parsed)
        marker = parsed[0]
        self.assertEqual(text[marker["start"]:marker["end"]], marker["marker"])
        self.assertEqual(marker["title"], "نسخ")
        self.assertEqual(marker["button_type"], "copy")
        self.assertEqual(marker["value"], "النص")
        self.assertEqual(marker["color"], "g")
        self.assertEqual(marker["audience"], "all")

    def test_inline_marker_parses_subscriber_cbd(self):
        parsed = parse_inline_markers("{للمشتركين:cbd a86d3132#g sub}")

        self.assertIsNotNone(parsed)
        marker = parsed[0]
        self.assertEqual(marker["button_type"], "page_callback")
        self.assertEqual(marker["value"], "a86d3132")
        self.assertEqual(marker["color"], "g")
        self.assertEqual(marker["audience"], "subscribers")

    def test_inline_marker_nested_open_brace_matches_python_regex_behavior(self):
        parsed = parse_inline_markers("قبل {bad {ok - callback_data: yes} بعد")

        self.assertIsNotNone(parsed)
        self.assertEqual(len(parsed), 1)
        marker = parsed[0]
        self.assertEqual(marker["title"], "ok")
        self.assertEqual(marker["value"], "yes")

    def test_html_to_rich_handles_nested_formatting_links_and_custom_emoji(self):
        parsed = html_to_rich(
            '<p>قبل <b>غامق</b> <a href="#prices">الأسعار</a> '
            '<tg-emoji emoji-id="42">⭐</tg-emoji></p>'
        )

        self.assertEqual(parsed[0], "قبل ")
        self.assertEqual(parsed[1], {"type": "bold", "text": "غامق"})
        self.assertEqual(parsed[2], " ")
        self.assertEqual(
            parsed[3],
            {"type": "anchor_link", "text": "الأسعار", "anchor_name": "prices"},
        )
        self.assertEqual(parsed[4], " ")
        self.assertEqual(
            parsed[5],
            {"type": "custom_emoji", "custom_emoji_id": "42", "alternative_text": "⭐"},
        )

    def test_html_to_rich_decodes_entities_and_breaks(self):
        self.assertEqual(html_to_rich("A&amp;B<br>C"), ["A&B", "\n", "C"])

    def test_quoted_gt_in_href_matches_python_parser(self):
        source = '<a href="https://example.com/?q=a>b">x</a>'
        parser = _RichTextHTMLParser()
        parser.feed(source)
        expected = parser.result()

        self.assertEqual(
            expected,
            {"type": "url", "text": "x", "url": "https://example.com/?q=a>b"},
        )
        self.assertEqual(html_to_rich(source), expected)

    def test_unquoted_href_slashes_match_python_parser(self):
        source = "<a href=https://example.com/a/b>x</a>"
        parser = _RichTextHTMLParser()
        parser.feed(source)
        expected = parser.result()

        self.assertEqual(
            expected,
            {"type": "url", "text": "x", "url": "https://example.com/a/b"},
        )
        self.assertEqual(html_to_rich(source), expected)

    def test_ambiguous_unquoted_self_close_falls_back_to_python(self):
        source = "<a href=https://example.com/>x</a>"
        parser = _RichTextHTMLParser()
        parser.feed(source)
        expected = parser.result()

        self.assertIsNone(html_to_rich(source))
        self.assertEqual(_html_rich_text(source), expected)

    def test_comment_and_incomplete_tag_fall_back_to_python(self):
        for source in ("<!-- comment > still comment -->x", "x<b", "x<3>y"):
            with self.subTest(source=source):
                parser = _RichTextHTMLParser()
                parser.feed(source)
                expected = parser.result()

                self.assertIsNone(html_to_rich(source))
                self.assertEqual(_html_rich_text(source), expected)

    def test_mismatched_close_tag_matches_python_parser_exactly(self):
        source = "<b><i>x</b>y</i>"
        parser = _RichTextHTMLParser()
        parser.feed(source)
        expected = parser.result()

        self.assertEqual(expected, ["x", "y"])
        self.assertEqual(html_to_rich(source), expected)

    def test_fifty_siblings_preserve_order(self):
        source = "".join(f"<b>{index}</b>" for index in range(50))
        parsed = html_to_rich(source)

        self.assertEqual(len(parsed), 50)
        self.assertEqual(
            [item["text"] for item in parsed],
            [str(index) for index in range(50)],
        )

    def test_native_depth_limit_falls_back_to_python_without_crashing(self):
        limit = native_max_nesting()
        self.assertIsNotNone(limit)
        depth = limit + 20
        source = ("<b>" * depth) + "x" + ("</b>" * depth)

        # Direct native wrapper reports None on the guarded Rust error.
        self.assertIsNone(html_to_rich(source))

        # Renderer then uses the existing Python HTMLParser and keeps working.
        parsed = _html_rich_text(source)
        current = parsed
        seen = 0
        while isinstance(current, dict) and current.get("type") == "bold":
            seen += 1
            current = current.get("text")
        self.assertEqual(seen, depth)
        self.assertEqual(current, "x")


class RichMessageWidthAndOrderTests(unittest.TestCase):
    def test_long_32k_text_builds(self):
        text = "x" * 32_000
        rich = build_input_rich_message([{
            "id": "long-text",
            "type": "paragraph",
            "position": 0,
            "data": {"text": text, "html": f"<p>{text}</p>"},
        }]).model_dump(mode="json", exclude_none=True)

        self.assertEqual(rich["blocks"][0]["text"], text)

    def test_table_fifty_columns_preserves_empty_and_duplicate_cells(self):
        rich = build_input_rich_message(table_block()).model_dump(
            mode="json",
            exclude_none=True,
        )
        cells = rich["blocks"][0]["cells"]

        self.assertEqual(len(cells), 4)
        self.assertTrue(all(len(row) == 50 for row in cells))
        self.assertEqual(cells[0][1]["text"], {"type": "bold", "text": "duplicate"})
        self.assertEqual(cells[0][2]["text"], {"type": "bold", "text": "duplicate"})
        self.assertEqual(cells[1][10]["text"], "")
        self.assertEqual(cells[1][20]["text"], "")
        self.assertEqual(cells[3][49]["text"], {"type": "bold", "text": "r3c49"})

    def test_fifty_attachments_preserve_exact_block_order(self):
        rich = build_input_rich_message(document_blocks()).model_dump(
            mode="json",
            exclude_none=True,
        )
        blocks = rich["blocks"]

        self.assertEqual(len(blocks), 50)
        self.assertEqual([block["type"] for block in blocks], ["document"] * 50)
        self.assertEqual(
            [block["document"]["media"] for block in blocks],
            [f"telegram-file-id-{index:02d}" for index in range(50)],
        )
        self.assertEqual(
            [block["caption"]["text"]["text"][:7] for block in blocks],
            [f"file-{index:02d}"[:7] for index in range(50)],
        )

    def test_fifty_attachments_with_about_32k_caption_text_keep_order(self):
        blocks = document_blocks(caption_size=640)
        rich = build_input_rich_message(blocks).model_dump(
            mode="json",
            exclude_none=True,
        )

        self.assertEqual(len(rich["blocks"]), 50)
        total_caption_chars = sum(
            len(block["caption"]["text"]["text"])
            for block in rich["blocks"]
        )
        self.assertEqual(total_caption_chars, 32_000)
        self.assertEqual(
            [block["document"]["media"] for block in rich["blocks"]],
            [f"telegram-file-id-{index:02d}" for index in range(50)],
        )


if __name__ == "__main__":
    unittest.main()

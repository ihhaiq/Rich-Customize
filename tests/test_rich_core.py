import unittest

from app.services.rich_core import html_to_rich, native_available, parse_inline_markers


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


if __name__ == "__main__":
    unittest.main()

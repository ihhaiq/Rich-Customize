import unittest

from app.services.blocks import (
    delete_block, move_block, normalize_block_positions,
)
from app.services.buttons import (
    add_message_button, change_message_button_type,
    delete_message_button, move_message_button,
    infer_button_type_and_value, normalize_button_url,
)
from app.editor.builders import list_data, new_block, preformatted_data
from app.services.inline_buttons import find_user_button_markers, inline_button_rich_text
from app.services.renderer import build_input_rich_message


def sample_blocks():
    return [
        {"id": "a", "type": "text", "position": 0, "data": {}},
        {"id": "b", "type": "photo", "position": 1, "data": {}},
        {"id": "c", "type": "audio", "position": 2, "data": {}},
        {"id": "d", "type": "video", "position": 3, "data": {}},
    ]


class BlockOperationsTests(unittest.TestCase):
    def test_new_inline_button_syntax_is_case_and_space_tolerant(self):
        callback = inline_button_rich_text(
            "{تنفيذ - CALLBACK_DATA :  action:1  }",
        )
        copy = inline_button_rich_text("{نسخ - CoPy: النص #R }")
        link = inline_button_rich_text("{قناتي-T.ME/IHHAI}")

        self.assertEqual(callback["button"]["callback_data"], "action:1")
        self.assertEqual(copy["button"]["copy_text"]["text"], "النص")
        self.assertEqual(copy["button"]["style"], "danger")
        self.assertEqual(link["button"]["url"], "https://T.ME/IHHAI")

    def test_new_inline_button_syntax_accepts_named_colors(self):
        button = inline_button_rich_text("{نسخ - copy: النص - GrEeN}")

        self.assertEqual(button["button"]["style"], "success")

    def test_direct_http_button_works_inside_list_block(self):
        text = (
            "الخطوة الاولى الدخول الى تطبيق بوت فاذر المصغر "
            "{اضغط هنا - http://t.me/botfather?startapp #b }"
        )
        rich = build_input_rich_message([
            new_block("list", {"items": [text]}),
        ]).model_dump(mode="json", exclude_none=True)

        rendered = rich["blocks"][0]["items"][0]["blocks"][0]["text"]
        self.assertEqual(rendered[0], "الخطوة الاولى الدخول الى تطبيق بوت فاذر المصغر ")
        self.assertEqual(
            rendered[1]["button"]["url"],
            "http://t.me/botfather?startapp",
        )
        self.assertEqual(rendered[1]["button"]["style"], "primary")

    def test_numbered_list_uses_native_numeric_labels(self):
        data = list_data("الأول\n2. الثاني", "numbered")
        rich = build_input_rich_message([
            new_block("list", data),
        ]).model_dump(mode="json", exclude_none=True)

        items = rich["blocks"][0]["items"]
        self.assertEqual([item["value"] for item in items], [1, 2])
        self.assertEqual([item["type"] for item in items], ["1", "1"])
        self.assertEqual(items[1]["blocks"][0]["text"], "الثاني")

    def test_checklist_defaults_to_pending_and_accepts_completed_markers(self):
        data = list_data(
            "مهمة عادية\n[x] مهمة منجزة\n✅ منجزة أيضًا\n[ ] غير منجزة",
            "checklist",
        )
        rich = build_input_rich_message([
            new_block("list", data),
        ]).model_dump(mode="json", exclude_none=True)

        items = rich["blocks"][0]["items"]
        self.assertTrue(all(item["has_checkbox"] for item in items))
        self.assertEqual(
            [item.get("is_checked", False) for item in items],
            [False, True, True, False],
        )
        self.assertEqual(items[0]["blocks"][0]["text"], "مهمة عادية")

    def test_user_marker_needs_no_content_and_ignores_case(self):
        markers = find_user_button_markers("{اختيار الوجهة - UsEr #P}")

        self.assertEqual(markers, [{
            "marker": "{اختيار الوجهة - UsEr #P}",
            "title": "اختيار الوجهة",
            "color": "p",
        }])

    def test_legacy_inline_button_syntax_remains_supported(self):
        button = inline_button_rich_text(
            "{قديم:url https://foo-bar.com#b}",
        )

        self.assertEqual(button["button"]["url"], "https://foo-bar.com")
        self.assertEqual(button["button"]["style"], "primary")

    def test_preformatted_language_can_be_set_with_lang_header(self):
        data = preformatted_data("/lang python\nprint('<ok>')")

        self.assertEqual(data["language"], "python")
        self.assertEqual(data["text"], "print('<ok>')")
        self.assertIn('class="language-python"', data["html"])
        self.assertIn("&lt;ok&gt;", data["html"])

        rich = build_input_rich_message([
            new_block("preformatted", data),
        ]).model_dump(mode="json", exclude_none=True)
        self.assertEqual(rich["blocks"][0]["language"], "python")
        self.assertEqual(rich["blocks"][0]["text"], "print('<ok>')")

    def test_preformatted_language_can_be_set_with_code_fence(self):
        data = preformatted_data("```javascript\nconsole.log('ok')\n```")

        self.assertEqual(data["language"], "javascript")
        self.assertEqual(data["text"], "console.log('ok')")

    def test_math_expression_preserves_escaped_space(self):
        expression = r"\text{Huge\ Pony}"
        block = new_block("mathematical_expression", {"text": expression})

        rich = build_input_rich_message([block]).model_dump(
            mode="json", exclude_none=True,
        )

        self.assertEqual(rich["blocks"][0]["expression"], expression)

    def test_move_preserves_relative_order(self):
        blocks = sample_blocks()
        self.assertTrue(move_block(blocks, "d", 1))
        self.assertEqual([item["id"] for item in blocks], ["a", "d", "b", "c"])
        self.assertEqual([item["position"] for item in blocks], [0, 1, 2, 3])

    def test_delete_normalizes_positions(self):
        blocks = sample_blocks()
        self.assertTrue(delete_block(blocks, "b"))
        self.assertEqual([item["id"] for item in blocks], ["a", "c", "d"])
        self.assertEqual([item["position"] for item in blocks], [0, 1, 2])

    def test_stale_id_is_safe(self):
        blocks = sample_blocks()
        self.assertFalse(delete_block(blocks, "missing"))
        self.assertFalse(move_block(blocks, "missing", 0))

    def test_normalization_sorts_first(self):
        blocks = sample_blocks()[::-1]
        normalize_block_positions(blocks)
        self.assertEqual([item["id"] for item in blocks], ["a", "b", "c", "d"])


class MessageButtonOperationsTests(unittest.TestCase):
    def test_change_button_type_preserves_title_and_style(self):
        buttons = []
        button = add_message_button(buttons, "الموقع", "https://example.com", "url")
        button["style"] = "danger"

        changed = change_message_button_type(button, "disabled", "")

        self.assertTrue(changed)
        self.assertEqual(button["text"], "الموقع")
        self.assertEqual(button["style"], "danger")
        self.assertEqual(button["type"], "disabled")
        self.assertNotIn("url", button)

    def test_add_move_and_delete_button(self):
        buttons = []
        first = add_message_button(buttons, "الأول", "https://example.com/1")
        second = add_message_button(buttons, "الثاني", "https://example.com/2")
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertTrue(move_message_button(buttons, second["id"], 0))
        self.assertEqual([item["text"] for item in buttons], ["الثاني", "الأول"])
        self.assertTrue(delete_message_button(buttons, first["id"]))
        self.assertEqual([item["position"] for item in buttons], [0])

    def test_normalize_button_url(self):
        self.assertEqual(normalize_button_url("t.me/example"), "https://t.me/example")
        self.assertEqual(normalize_button_url("@ihhai"), "https://t.me/ihhai")
        self.assertEqual(normalize_button_url("  @RichCustomizebot  "), "https://t.me/RichCustomizebot")
        self.assertIsNone(normalize_button_url("@bad"))
        self.assertEqual(normalize_button_url("tg://resolve?domain=example"), "tg://resolve?domain=example")
        self.assertIsNone(normalize_button_url("javascript:alert(1)"))

    def test_managed_button_content_infers_a_new_type(self):
        self.assertEqual(
            infer_button_type_and_value("  CoPy : النص المطلوب  ", "callback_data"),
            ("copy", "النص المطلوب"),
        )
        self.assertEqual(
            infer_button_type_and_value("CALLBACK DATA : action:2", "url"),
            ("callback_data", "action:2"),
        )
        self.assertEqual(
            infer_button_type_and_value("t.me/ihhai", "copy"),
            ("url", "t.me/ihhai"),
        )
        self.assertEqual(
            infer_button_type_and_value("CBD : a86d3132", "url"),
            ("page", "a86d3132"),
        )

    def test_plain_managed_button_content_keeps_its_current_type(self):
        self.assertEqual(
            infer_button_type_and_value("action:2", "callback_data"),
            ("callback_data", "action:2"),
        )

if __name__ == "__main__":
    unittest.main()

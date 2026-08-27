import unittest

from app.services.blocks import (
    delete_block, move_block, normalize_block_positions,
)
from app.services.buttons import (
    add_message_button, change_message_button_type,
    delete_message_button, move_message_button,
    normalize_button_url,
)
from app.services.factory import new_block
from app.services.renderer import build_input_rich_message


def sample_blocks():
    return [
        {"id": "a", "type": "text", "position": 0, "data": {}},
        {"id": "b", "type": "photo", "position": 1, "data": {}},
        {"id": "c", "type": "audio", "position": 2, "data": {}},
        {"id": "d", "type": "video", "position": 3, "data": {}},
    ]


class BlockOperationsTests(unittest.TestCase):
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

if __name__ == "__main__":
    unittest.main()

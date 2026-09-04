import unittest

from app.editor.models import make_block, normalize_blocks
from app.services.details_editor import delete_details_child, details_children
from app.services.renderer import build_input_rich_message


class EmptyDetailsRecoveryTests(unittest.TestCase):
    def test_empty_details_is_repaired_before_render(self):
        blocks = [
            make_block(
                "details",
                {"summary_html": "تفاصيل", "children": []},
            ),
        ]

        normalize_blocks(blocks)

        children = blocks[0]["data"]["children"]
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["type"], "paragraph")
        self.assertEqual(children[0]["data"]["text"], "…")

        rich_message = build_input_rich_message(blocks)
        payload = rich_message.model_dump(mode="json", exclude_none=True)
        self.assertEqual(payload["blocks"][0]["type"], "details")
        self.assertEqual(payload["blocks"][0]["blocks"][0]["type"], "paragraph")
        self.assertEqual(payload["blocks"][0]["blocks"][0]["text"], "…")

    def test_malformed_details_children_are_repaired_after_normalization(self):
        blocks = [{
            "id": "details-bad-children",
            "type": "details",
            "position": 0,
            "source": "generated",
            "data": {
                "summary_html": "تفاصيل",
                "children": [None, "bad child"],
            },
        }]

        normalize_blocks(blocks)

        children = blocks[0]["data"]["children"]
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["type"], "paragraph")
        self.assertEqual(children[0]["data"]["text"], "…")
        build_input_rich_message(blocks)

    def test_empty_native_details_is_detached_before_render(self):
        blocks = [
            make_block(
                "details",
                {
                    "summary_html": "Imported details",
                    "children": [],
                    "native": True,
                    "native_type": "details",
                    "native_data": {
                        "type": "details",
                        "summary": "Imported details",
                        "blocks": [],
                    },
                },
                source="native",
            ),
        ]

        normalize_blocks(blocks)

        details = blocks[0]
        self.assertEqual(details["source"], "generated")
        self.assertNotIn("native", details["data"])
        self.assertNotIn("native_data", details["data"])
        self.assertEqual(len(details["data"]["children"]), 1)
        build_input_rich_message(blocks)

    def test_deleting_last_details_child_keeps_a_safe_placeholder(self):
        child = make_block(
            "paragraph",
            {"text": "آخر محتوى", "html": "<p>آخر محتوى</p>"},
        )
        details = make_block(
            "details",
            {"summary_html": "تفاصيل", "children": [child]},
        )

        self.assertTrue(delete_details_child(details, child["id"]))

        children = details_children(details)
        self.assertEqual(len(children), 1)
        self.assertNotEqual(children[0]["id"], child["id"])
        self.assertEqual(children[0]["type"], "paragraph")
        self.assertEqual(children[0]["data"]["text"], "…")

    def test_replacing_details_children_with_empty_list_keeps_it_valid(self):
        from app.services.details_editor import replace_details_children

        details = make_block(
            "details",
            {"summary_html": "تفاصيل", "children": []},
        )
        replace_details_children(details, [])

        children = details_children(details)
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["type"], "paragraph")


if __name__ == "__main__":
    unittest.main()

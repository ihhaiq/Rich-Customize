from __future__ import annotations

import unittest

from app.editor.models import make_block
from app.routers.details import (
    add_details_child,
    delete_details_child,
    details_children,
    move_details_child,
    replace_details_child,
    router as details_router,
)


class DetailsDomainTests(unittest.TestCase):
    def test_native_details_detaches_when_a_child_is_edited(self):
        details = make_block(
            "details",
            {
                "native_data": {"type": "details", "summary": "S", "blocks": []},
                "children": [
                    make_block("paragraph", {"text": "one"}),
                    make_block("footer", {"text": "two"}),
                ],
            },
            source="native",
        )
        first_id = details_children(details)[0]["id"]

        replacement = make_block("heading", {"text": "changed"})
        updated = replace_details_child(details, first_id, replacement)

        self.assertIsNotNone(updated)
        self.assertEqual(details["source"], "generated")
        self.assertNotIn("native_data", details["data"])
        self.assertEqual(details_children(details)[0]["type"], "heading")

    def test_details_children_use_shared_document_operations(self):
        details = make_block("details", {"children": []})
        first = add_details_child(details, make_block("paragraph", {"text": "a"}))
        second = add_details_child(details, make_block("footer", {"text": "b"}))

        self.assertEqual([item["position"] for item in details_children(details)], [0, 1])
        self.assertTrue(move_details_child(details, second["id"], 0))
        self.assertEqual(details_children(details)[0]["id"], second["id"])
        self.assertTrue(delete_details_child(details, first["id"]))
        self.assertEqual(len(details_children(details)), 1)


class DetailsRouterTests(unittest.TestCase):
    def test_details_is_an_aggregator_not_a_new_monolith(self):
        self.assertEqual(len(details_router.sub_routers), 3)
        self.assertEqual(
            {child.name for child in details_router.sub_routers},
            {"details_builder", "details_manager", "details_edit"},
        )

    def test_real_router_has_details_without_legacy_fallback(self):
        from app.routers import rich_editor

        names = {child.name for child in rich_editor.router.sub_routers}
        self.assertIn("details", names)
        self.assertNotIn("rich_editor", names)


if __name__ == "__main__":
    unittest.main()

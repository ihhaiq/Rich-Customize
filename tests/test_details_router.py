from __future__ import annotations

import unittest
from types import SimpleNamespace

from aiogram import F, Router

from app.editor.models import make_block
from app.routers import editor_core
from app.routers.details import (
    LEGACY_DETAILS_CALLBACKS,
    add_details_child,
    delete_details_child,
    detach_legacy_details_handlers,
    details_children,
    install_into,
    legacy_details_handlers,
    move_details_child,
    replace_details_child,
    router as details_router,
)


class DetailsDomainTests(unittest.TestCase):
    def test_native_details_detaches_when_a_child_is_edited(self):
        details = make_block(
            "details",
            {
                "native_data": {
                    "type": "details",
                    "summary": "S",
                    "blocks": [],
                },
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
        first = add_details_child(
            details,
            make_block("paragraph", {"text": "a"}),
        )
        second = add_details_child(
            details,
            make_block("footer", {"text": "b"}),
        )

        self.assertEqual(
            [item["position"] for item in details_children(details)],
            [0, 1],
        )
        self.assertTrue(move_details_child(details, second["id"], 0))
        self.assertEqual(details_children(details)[0]["id"], second["id"])
        self.assertTrue(delete_details_child(details, first["id"]))
        self.assertEqual(len(details_children(details)), 1)

    def test_details_is_an_aggregator_not_a_new_monolith(self):
        self.assertEqual(len(details_router.sub_routers), 3)
        self.assertEqual(
            {child.name for child in details_router.sub_routers},
            {"details_builder", "details_manager", "details_edit"},
        )

    def test_legacy_details_callbacks_are_detached(self):
        legacy = SimpleNamespace(router=Router(name="legacy-test"))

        async def ordinary_callback(*args, **kwargs):
            return None

        legacy.router.callback_query.register(
            ordinary_callback,
            F.data == "r:ordinary",
        )

        for index, name in enumerate(sorted(LEGACY_DETAILS_CALLBACKS)):
            async def callback(*args, **kwargs):
                return None
            callback.__name__ = name
            legacy.router.callback_query.register(
                callback,
                F.data == f"r:legacy:{index}",
            )

        removed = detach_legacy_details_handlers(legacy)

        self.assertEqual(set(removed), set(LEGACY_DETAILS_CALLBACKS))
        self.assertEqual(legacy_details_handlers(legacy), ())
        remaining_names = {
            getattr(handler.callback, "__name__", "")
            for handler in legacy.router.callback_query.handlers
        }
        self.assertIn("ordinary_callback", remaining_names)

    def test_real_legacy_router_has_no_active_details_callbacks_after_install(self):
        legacy = editor_core.compat_module
        before = len(legacy.router.callback_query.handlers)

        install_into(legacy)

        self.assertEqual(legacy_details_handlers(legacy), ())
        self.assertEqual(len(legacy.router.callback_query.handlers), 0)
        self.assertLessEqual(len(legacy.router.callback_query.handlers), before)


if __name__ == "__main__":
    unittest.main()

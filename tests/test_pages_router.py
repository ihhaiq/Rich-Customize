from __future__ import annotations

import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.editor.draft_store import EditorDraft
from app.editor.history import UNDO_KEY
from app.routers.page_navigation_router import (
    open_page_link,
    restore_original_message,
)
from app.routers.page_support import save_changed_draft
from app.routers.pages import (
    router as pages_router,
)
from app.services.page_registry import PageRegistry


class FakeState:
    def __init__(self, data):
        self.data = copy.deepcopy(data)

    async def get_data(self):
        return copy.deepcopy(self.data)

    async def update_data(self, **kwargs):
        self.data.update(copy.deepcopy(kwargs))
        return copy.deepcopy(self.data)


class PageDraftHistoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_opening_page_shape_uses_one_shared_history_snapshot(self):
        state = FakeState({
            "blocks": [{"id": "old", "type": "paragraph", "position": 0, "data": {}}],
            "message_buttons": [],
            "buttons_per_row": 1,
            "buttons_align": "center",
            "current_page_id": None,
            "current_page_title": None,
        })
        before = EditorDraft.from_state(await state.get_data())
        after = copy.deepcopy(before)
        after.current_page_id = "page-two"
        after.current_page_title = "Second"

        changed = await save_changed_draft(state, before, after)

        self.assertTrue(changed)
        self.assertEqual(state.data["current_page_id"], "page-two")
        self.assertEqual(len(state.data[UNDO_KEY]), 1)
        self.assertIsNone(state.data[UNDO_KEY][0]["current_page_id"])

    async def test_noop_page_draft_does_not_record_history(self):
        state = FakeState({
            "blocks": [],
            "message_buttons": [],
            "buttons_per_row": 1,
            "buttons_align": "center",
            "current_page_id": "same",
            "current_page_title": "Same",
        })
        draft = EditorDraft.from_state(await state.get_data())

        changed = await save_changed_draft(state, draft, copy.deepcopy(draft))

        self.assertFalse(changed)
        self.assertNotIn(UNDO_KEY, state.data)


class PageRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_restore_keeps_original_page_code_and_content(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            registry = PageRegistry(Path(temporary_dir) / "pages.json")
            snapshot = {
                "owner_id": 42,
                "title": "Recovered",
                "blocks": [{"id": "one", "type": "paragraph", "data": {}}],
                "buttons": [{"id": "button-one", "title": "Open"}],
                "buttons_per_row": 2,
                "buttons_align": "center",
                "created_at": 10,
                "updated_at": 20,
            }
            with (
                patch("app.services.page_registry.media_store.remember_blocks"),
                patch("app.services.page_registry.media_store.pin_page"),
            ):
                restored = await registry.restore("fixed-code", 42, snapshot)

            self.assertTrue(restored)
            page = await registry.get("fixed-code")
            self.assertIsNotNone(page)
            self.assertEqual(page["title"], "Recovered")
            self.assertEqual(page["blocks"], snapshot["blocks"])

    async def test_restore_rejects_wrong_owner_and_existing_code(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            registry = PageRegistry(Path(temporary_dir) / "pages.json")
            snapshot = {"owner_id": 42, "title": "Mine", "blocks": []}
            self.assertFalse(await registry.restore("fixed-code", 7, snapshot))
            with (
                patch("app.services.page_registry.media_store.remember_blocks"),
                patch("app.services.page_registry.media_store.pin_page"),
            ):
                self.assertTrue(await registry.restore("fixed-code", 42, snapshot))
                self.assertFalse(await registry.restore("fixed-code", 42, snapshot))


class PagesRouterTests(unittest.TestCase):
    @staticmethod
    def _registered_names(router, observer_name):
        observer = getattr(router, observer_name)
        names = [handler.callback.__name__ for handler in observer.handlers]
        for child in router.sub_routers:
            names.extend(PagesRouterTests._registered_names(child, observer_name))
        return names

    @staticmethod
    def _registered_callbacks(router, observer_name):
        observer = getattr(router, observer_name)
        callbacks = [handler.callback for handler in observer.handlers]
        for child in router.sub_routers:
            callbacks.extend(PagesRouterTests._registered_callbacks(child, observer_name))
        return callbacks

    def test_pages_aggregator_is_feature_split(self):
        self.assertEqual(
            {child.name for child in pages_router.sub_routers},
            {"page_actions", "page_search", "page_delivery", "page_navigation"},
        )

    def test_real_router_setup_has_one_active_copy(self):
        from app.routers import rich_editor
        sets = {
            "callback_query": {
                "save_page", "list_pages", "request_page_search", "open_page_sort",
                "set_page_sort", "request_page_rename", "confirm_page_delete",
                "delete_saved_page", "open_saved_page", "open_page_link",
                "open_gated_page_link", "navigate_page_back", "navigate_page_home",
                "restore_original_message",
            },
            "message": {"receive_page_name", "receive_page_search", "receive_page_rename"},
            "inline_query": {"find_saved_page_inline"},
            "guest_message": {"summon_saved_rich_page"},
        }
        for observer_name, names in sets.items():
            registered = self._registered_callbacks(rich_editor.router, observer_name)
            for name in names:
                matches = [callback for callback in registered if callback.__name__ == name]
                self.assertGreaterEqual(len(matches), 1, name)
                self.assertEqual(len({id(callback) for callback in matches}), 1, name)
        self.assertIs(rich_editor.open_page_link, open_page_link)
        self.assertIs(rich_editor.restore_original_message, restore_original_message)

        top_level_names = [child.name for child in rich_editor.router.sub_routers]
        self.assertNotIn("rich_editor", top_level_names)


if __name__ == "__main__":
    unittest.main()

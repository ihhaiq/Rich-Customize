from __future__ import annotations

import copy
import unittest
from types import SimpleNamespace

from aiogram import F, Router

from app.editor.draft_store import EditorDraft
from app.editor.history import UNDO_KEY
from app.routers.page_navigation_router import (
    open_page_link,
    restore_original_message,
)
from app.routers.page_support import save_changed_draft
from app.routers.pages import (
    LEGACY_PAGE_CALLBACKS,
    LEGACY_PAGE_GUEST_MESSAGES,
    LEGACY_PAGE_INLINE_QUERIES,
    LEGACY_PAGE_MESSAGES,
    detach_legacy_page_handlers,
    legacy_page_handlers,
    router as pages_router,
)


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

    def test_detach_removes_page_handlers_from_every_observer(self):
        legacy = SimpleNamespace(router=Router(name="legacy-pages-test"))
        sets = {
            "callback_query": LEGACY_PAGE_CALLBACKS,
            "message": LEGACY_PAGE_MESSAGES,
            "inline_query": LEGACY_PAGE_INLINE_QUERIES,
            "guest_message": LEGACY_PAGE_GUEST_MESSAGES,
        }
        for observer_name, names in sets.items():
            observer = getattr(legacy.router, observer_name)
            for index, name in enumerate(sorted(names)):
                async def handler(*args, **kwargs):
                    return None
                handler.__name__ = name
                if observer_name == "callback_query":
                    observer.register(handler, F.data == f"legacy-page:{index}")
                else:
                    observer.register(handler)

        removed = detach_legacy_page_handlers(legacy)

        for observer_name, names in sets.items():
            self.assertEqual(set(removed[observer_name]), set(names))
        self.assertEqual(
            legacy_page_handlers(legacy),
            {
                "callback_query": (),
                "message": (),
                "inline_query": (),
                "guest_message": (),
            },
        )

    def test_real_router_setup_has_one_active_copy_without_legacy_fallback(self):
        from app.routers import rich_editor
        sets = {
            "callback_query": LEGACY_PAGE_CALLBACKS,
            "message": LEGACY_PAGE_MESSAGES,
            "inline_query": LEGACY_PAGE_INLINE_QUERIES,
            "guest_message": LEGACY_PAGE_GUEST_MESSAGES,
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

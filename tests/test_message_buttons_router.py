from __future__ import annotations

import copy
import unittest
from types import SimpleNamespace

from aiogram import F, Router

from app.editor.draft_store import EditorDraft
from app.editor.history import UNDO_KEY
from app.routers.button_input import receive_button_value
from app.routers.button_support import save_changed_draft
from app.routers.button_target_picker import (
    ask_for_button_user,
    complete_button_target,
    defer_text_for_user_buttons,
)
from app.routers.message_buttons import (
    LEGACY_BUTTON_CALLBACKS,
    LEGACY_BUTTON_MESSAGES,
    detach_legacy_button_handlers,
    legacy_button_handlers,
    router as message_buttons_router,
)


class FakeState:
    def __init__(self, data):
        self.data = copy.deepcopy(data)

    async def get_data(self):
        return copy.deepcopy(self.data)

    async def update_data(self, **kwargs):
        self.data.update(copy.deepcopy(kwargs))
        return copy.deepcopy(self.data)


class MessageButtonsDraftTests(unittest.IsolatedAsyncioTestCase):
    async def test_changed_button_draft_records_one_shared_history_snapshot(self):
        state = FakeState({
            "blocks": [],
            "message_buttons": [],
            "buttons_per_row": 1,
            "buttons_align": "center",
        })
        before = EditorDraft.from_state(await state.get_data())
        after = copy.deepcopy(before)
        after.buttons_per_row = 2

        changed = await save_changed_draft(state, before, after)

        self.assertTrue(changed)
        self.assertEqual(state.data["buttons_per_row"], 2)
        self.assertEqual(len(state.data[UNDO_KEY]), 1)
        self.assertEqual(state.data[UNDO_KEY][0]["buttons_per_row"], 1)

    async def test_noop_button_draft_does_not_record_history(self):
        state = FakeState({
            "blocks": [],
            "message_buttons": [],
            "buttons_per_row": 1,
            "buttons_align": "center",
        })
        draft = EditorDraft.from_state(await state.get_data())

        changed = await save_changed_draft(state, draft, copy.deepcopy(draft))

        self.assertFalse(changed)
        self.assertNotIn(UNDO_KEY, state.data)


class MessageButtonsRouterTests(unittest.TestCase):
    @staticmethod
    def _registered_names(router, observer_name):
        observer = getattr(router, observer_name)
        names = [handler.callback.__name__ for handler in observer.handlers]
        for child in router.sub_routers:
            names.extend(MessageButtonsRouterTests._registered_names(child, observer_name))
        return names

    def test_aggregator_is_split_by_responsibility(self):
        self.assertEqual(
            {child.name for child in message_buttons_router.sub_routers},
            {"button_target_picker", "button_actions", "button_input"},
        )

    def test_detach_removes_all_named_button_handlers_only(self):
        legacy = SimpleNamespace(router=Router(name="legacy-button-test"))

        async def ordinary_callback(*args, **kwargs):
            return None

        async def ordinary_message(*args, **kwargs):
            return None

        legacy.router.callback_query.register(ordinary_callback, F.data == "ordinary")
        legacy.router.message.register(ordinary_message)
        for index, name in enumerate(sorted(LEGACY_BUTTON_CALLBACKS)):
            async def callback(*args, **kwargs):
                return None
            callback.__name__ = name
            legacy.router.callback_query.register(callback, F.data == f"legacy:{index}")
        for name in sorted(LEGACY_BUTTON_MESSAGES):
            async def message(*args, **kwargs):
                return None
            message.__name__ = name
            legacy.router.message.register(message)

        removed = detach_legacy_button_handlers(legacy)

        self.assertEqual(set(removed["callback_query"]), set(LEGACY_BUTTON_CALLBACKS))
        self.assertEqual(set(removed["message"]), set(LEGACY_BUTTON_MESSAGES))
        self.assertEqual(
            legacy_button_handlers(legacy),
            {"callback_query": (), "message": ()},
        )
        self.assertIn(
            "ordinary_callback",
            {handler.callback.__name__ for handler in legacy.router.callback_query.handlers},
        )
        self.assertIn(
            "ordinary_message",
            {handler.callback.__name__ for handler in legacy.router.message.handlers},
        )

    def test_real_router_has_one_active_copy_without_legacy_fallback(self):
        from app.routers import rich_editor

        callback_names = self._registered_names(rich_editor.router, "callback_query")
        message_names = self._registered_names(rich_editor.router, "message")
        for name in LEGACY_BUTTON_CALLBACKS:
            self.assertEqual(callback_names.count(name), 1, name)
        for name in LEGACY_BUTTON_MESSAGES:
            self.assertEqual(message_names.count(name), 1, name)

        self.assertNotIn(
            "rich_editor",
            {child.name for child in rich_editor.router.sub_routers},
        )


if __name__ == "__main__":
    unittest.main()

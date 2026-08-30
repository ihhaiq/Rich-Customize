from __future__ import annotations

import copy
import unittest
from types import SimpleNamespace

from aiogram import F, Router

from app.editor.session import load_editor_session
from app.routers.editor_session import (
    LEGACY_SESSION_CALLBACKS,
    LEGACY_SESSION_CHANNEL_POSTS,
    LEGACY_SESSION_MESSAGES,
    detach_legacy_session_handlers,
    legacy_session_handlers,
    router as editor_session_router,
)


class FakeState:
    def __init__(self, data):
        self.data = copy.deepcopy(data)

    async def get_data(self):
        return copy.deepcopy(self.data)


class EditorSessionBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_session_reads_canonical_draft_through_boundary(self):
        state = FakeState({
            "blocks": [{"id": "a", "type": "paragraph", "position": 4, "data": {}}],
            "message_buttons": [],
            "buttons_per_row": 2,
            "buttons_align": "right",
            "management_message_id": 20,
        })
        callback = SimpleNamespace(answer=None)

        data, blocks = await load_editor_session(callback, state)

        self.assertEqual(blocks[0]["position"], 0)
        self.assertEqual(data["buttons_per_row"], 2)
        self.assertEqual(data["management_message_id"], 20)


class EditorSessionRouterTests(unittest.TestCase):
    @staticmethod
    def _registered_callbacks(router, observer_name):
        observer = getattr(router, observer_name)
        callbacks = [handler.callback for handler in observer.handlers]
        for child in router.sub_routers:
            callbacks.extend(
                EditorSessionRouterTests._registered_callbacks(child, observer_name)
            )
        return callbacks

    def test_aggregator_is_split_by_responsibility(self):
        self.assertEqual(
            {child.name for child in editor_session_router.sub_routers},
            {
                "editor_showcase",
                "editor_preview",
                "editor_navigation",
                "editor_entry",
            },
        )

    def test_detach_removes_session_handlers_from_all_observers(self):
        legacy = SimpleNamespace(router=Router(name="legacy-session-test"))
        sets = {
            "callback_query": LEGACY_SESSION_CALLBACKS,
            "message": LEGACY_SESSION_MESSAGES,
            "channel_post": LEGACY_SESSION_CHANNEL_POSTS,
        }
        for observer_name, names in sets.items():
            observer = getattr(legacy.router, observer_name)
            for index, name in enumerate(sorted(names)):
                async def handler(*args, **kwargs):
                    return None
                handler.__name__ = name
                if observer_name == "callback_query":
                    observer.register(handler, F.data == f"legacy-session:{index}")
                else:
                    observer.register(handler)

        removed = detach_legacy_session_handlers(legacy)

        for observer_name, names in sets.items():
            self.assertEqual(set(removed[observer_name]), set(names))
        self.assertEqual(
            legacy_session_handlers(legacy),
            {"callback_query": (), "message": (), "channel_post": ()},
        )

    def test_real_router_has_zero_active_legacy_handlers(self):
        from app.routers import editor_core
        from app.routers import rich_editor

        legacy = editor_core.compat_module
        self.assertEqual(
            legacy_session_handlers(legacy),
            {"callback_query": (), "message": (), "channel_post": ()},
        )
        self.assertEqual(
            sum(
                len(getattr(legacy.router, name).handlers)
                for name in (
                    "message",
                    "callback_query",
                    "my_chat_member",
                    "inline_query",
                    "guest_message",
                    "channel_post",
                )
            ),
            0,
        )
        sets = {
            "callback_query": LEGACY_SESSION_CALLBACKS,
            "message": LEGACY_SESSION_MESSAGES,
            "channel_post": LEGACY_SESSION_CHANNEL_POSTS,
        }
        for observer_name, names in sets.items():
            registered = self._registered_callbacks(rich_editor.router, observer_name)
            for name in names:
                matches = [callback for callback in registered if callback.__name__ == name]
                self.assertGreaterEqual(len(matches), 1, name)
                self.assertEqual(len({id(callback) for callback in matches}), 1, name)

        top_level_names = [child.name for child in rich_editor.router.sub_routers]
        self.assertLess(
            top_level_names.index("editor_session"),
            top_level_names.index("rich_editor"),
        )


if __name__ == "__main__":
    unittest.main()

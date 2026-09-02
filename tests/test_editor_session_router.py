from __future__ import annotations

import copy
import unittest
from types import SimpleNamespace

from app.editor.session import load_editor_session
from app.routers.editor_session import router as editor_session_router


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

    def test_real_router_has_one_copy_of_each_session_handler(self):
        from app.routers import rich_editor
        sets = {
            "callback_query": {
                "start_editor_from_button", "showcase_from_button", "no_op",
                "back_to_main", "open_editor_tools", "preview",
            },
            "message": {
                "start", "new_editor", "showcase_from_message", "receive_source",
                "import_rich_message_into_editor", "managing_extra_message",
            },
            "channel_post": {"remember_showcase_media"},
        }
        for observer_name, names in sets.items():
            registered = self._registered_callbacks(rich_editor.router, observer_name)
            for name in names:
                matches = [callback for callback in registered if callback.__name__ == name]
                self.assertGreaterEqual(len(matches), 1, name)
                self.assertEqual(len({id(callback) for callback in matches}), 1, name)

        top_level_names = [child.name for child in rich_editor.router.sub_routers]
        self.assertNotIn("rich_editor", top_level_names)


if __name__ == "__main__":
    unittest.main()

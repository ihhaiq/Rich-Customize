from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.routers.publish_support import chat_type_value, is_administrator
from app.routers.publishing import router as publishing_router


class PublishingSupportTests(unittest.TestCase):
    def test_telegram_enum_like_values_are_normalized(self):
        status = SimpleNamespace(value="administrator")
        member = SimpleNamespace(status=status)
        chat = SimpleNamespace(type=SimpleNamespace(value="channel"))

        self.assertTrue(is_administrator(member))
        self.assertEqual(chat_type_value(chat), "channel")


class PublishingRouterTests(unittest.TestCase):
    @staticmethod
    def _registered_callbacks(router, observer_name):
        observer = getattr(router, observer_name)
        callbacks = [handler.callback for handler in observer.handlers]
        for child in router.sub_routers:
            callbacks.extend(
                PublishingRouterTests._registered_callbacks(child, observer_name)
            )
        return callbacks

    def test_aggregator_is_split_by_responsibility(self):
        self.assertEqual(
            {child.name for child in publishing_router.sub_routers},
            {"publish_destinations", "publish_settings", "publish_actions"},
        )

    def test_real_router_has_one_active_copy(self):
        from app.routers import rich_editor
        sets = {
            "callback_query": {
                "open_post_chats", "return_to_post_chats", "select_post_chat",
                "open_post_settings", "toggle_post_option", "send_post",
            },
            "my_chat_member": {"remember_publish_chat"},
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

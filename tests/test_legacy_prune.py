from __future__ import annotations

import ast
import unittest
from pathlib import Path

from app.routers.block_input_support import quote_media_payload


class LegacyPhysicalPruneTests(unittest.TestCase):
    def test_legacy_file_contains_no_feature_definitions_or_decorators(self):
        path = Path(__file__).parents[1] / "app" / "routers" / "editor_legacy.py"
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)

        definitions = [
            node
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        ]
        self.assertEqual(definitions, [])
        self.assertNotIn("@router.", source)
        self.assertLessEqual(len(source.splitlines()), 50)

    def test_real_legacy_router_is_an_empty_compatibility_namespace(self):
        from app.routers import editor_core
        from app.routers import rich_editor  # noqa: F401

        legacy = editor_core.compat_module
        observer_names = (
            "message",
            "callback_query",
            "channel_post",
            "my_chat_member",
            "inline_query",
            "guest_message",
        )
        self.assertEqual(
            {name: len(getattr(legacy.router, name).handlers) for name in observer_names},
            {name: 0 for name in observer_names},
        )

    def test_quote_media_helper_keeps_only_media_and_live_caption(self):
        parsed = [
            {"id": "caption", "type": "caption", "position": 0},
            {"id": "photo", "type": "photo", "position": 4},
            {"id": "paragraph", "type": "paragraph", "position": 2},
        ]

        media, caption = quote_media_payload(parsed)

        self.assertEqual([item["id"] for item in media], ["photo"])
        self.assertEqual(media[0]["position"], 0)
        self.assertIs(caption, parsed[0])


if __name__ == "__main__":
    unittest.main()

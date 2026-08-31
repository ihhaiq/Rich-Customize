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

    def test_final_router_does_not_include_the_legacy_fallback(self):
        from app.routers import rich_editor

        self.assertNotIn(
            "rich_editor",
            {child.name for child in rich_editor.router.sub_routers},
        )

    def test_editor_core_alias_has_been_removed(self):
        path = Path(__file__).parents[1] / "app" / "routers" / "editor_core.py"
        self.assertFalse(path.exists())

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

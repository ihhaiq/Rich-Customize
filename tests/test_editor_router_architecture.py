from __future__ import annotations

import unittest
from pathlib import Path

from app.routers.block_input_support import quote_media_payload


class EditorRouterArchitectureTests(unittest.TestCase):
    def test_compatibility_modules_have_been_removed(self):
        routers = Path(__file__).parents[1] / "app" / "routers"

        self.assertFalse((routers / "editor_core.py").exists())
        self.assertFalse((routers / "editor_legacy.py").exists())

    def test_final_router_is_feature_only(self):
        from app.routers import rich_editor

        top_level_names = {child.name for child in rich_editor.router.sub_routers}
        self.assertNotIn("rich_editor", top_level_names)
        self.assertIn("block_management", top_level_names)
        self.assertIn("details", top_level_names)
        self.assertIn("message_buttons", top_level_names)
        self.assertIn("pages", top_level_names)
        self.assertIn("publishing", top_level_names)
        self.assertIn("editor_session", top_level_names)

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

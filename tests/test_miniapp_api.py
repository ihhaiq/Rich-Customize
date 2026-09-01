from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app import miniapp


class MiniAppApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_health_does_not_require_telegram_authentication(self):
        response = await miniapp.health(SimpleNamespace())

        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.body), {
            "ok": True,
            "service": "rich-customize",
            "beta": miniapp.BETA_VERSION,
        })

    async def test_page_update_persists_buttons_and_layout_from_payload(self):
        request = SimpleNamespace(
            match_info={"page_id": "page123"},
            json=AsyncMock(return_value={
                "title": "Updated",
                "blocks": [{"id": "b1", "type": "paragraph", "data": {}}],
                "buttons": [{"title": "Open", "type": "url", "value": "https://example.com"}],
                "buttons_per_row": 3,
                "buttons_align": "right",
            }),
        )
        current = {
            "owner_id": 42,
            "title": "Old",
            "buttons": [{"title": "Old"}],
            "buttons_per_row": 1,
            "buttons_align": "center",
        }

        with (
            patch.object(miniapp, "_miniapp_user", return_value={"id": 42}),
            patch.object(miniapp.page_registry, "get", AsyncMock(return_value=current)),
            patch.object(miniapp.page_registry, "save", AsyncMock(return_value="page123")) as save,
        ):
            response = await miniapp.api_save_page(request)

        self.assertEqual(response.status, 200)
        args = save.await_args.args
        self.assertEqual(args[3], request.json.return_value["buttons"])
        self.assertEqual(args[4], 3)
        self.assertEqual(args[5], "right")
        self.assertEqual(save.await_args.kwargs, {"page_id": "page123"})

    async def test_page_update_rejects_non_list_buttons(self):
        request = SimpleNamespace(
            match_info={"page_id": "page123"},
            json=AsyncMock(return_value={"blocks": [], "buttons": "invalid"}),
        )
        current = {"owner_id": 42}

        with (
            patch.object(miniapp, "_miniapp_user", return_value={"id": 42}),
            patch.object(miniapp.page_registry, "get", AsyncMock(return_value=current)),
        ):
            with self.assertRaises(miniapp.web.HTTPBadRequest):
                await miniapp.api_save_page(request)

    def test_page_content_rejects_invalid_layout_and_block_shapes(self):
        with self.assertRaises(miniapp.web.HTTPBadRequest):
            miniapp._page_content({"blocks": ["not-a-block"]})
        with self.assertRaises(miniapp.web.HTTPBadRequest):
            miniapp._page_content({"blocks": [], "buttons_per_row": 9})
        with self.assertRaises(miniapp.web.HTTPBadRequest):
            miniapp._page_content({"blocks": [], "buttons_align": "diagonal"})


if __name__ == "__main__":
    unittest.main()

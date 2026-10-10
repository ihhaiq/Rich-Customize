from __future__ import annotations

import copy
import unittest
from unittest.mock import AsyncMock, patch

from app.editor.models import make_block
from app.routers.block_preview import (
    _is_empty_rich_message_error,
    _send_single_block_preview,
)
from app.services.renderer import RichMessageRenderError


class BlockPreviewFallbackTests(unittest.IsolatedAsyncioTestCase):
    def test_empty_rich_message_error_detection_is_specific(self):
        self.assertTrue(_is_empty_rich_message_error(
            RichMessageRenderError("Telegram server says - Bad Request: RICH_MESSAGE_EMPTY")
        ))
        self.assertTrue(_is_empty_rich_message_error(
            RichMessageRenderError("Bad Request: rich message must be non-empty")
        ))
        self.assertFalse(_is_empty_rich_message_error(
            RichMessageRenderError("Bad Request: BUTTON_URL_INVALID")
        ))

    async def test_empty_standalone_preview_retries_with_preview_only_footer(self):
        block = make_block("divider", {}, position=3)
        before = copy.deepcopy(block)
        sent_message = object()
        sender = AsyncMock(side_effect=[
            RichMessageRenderError("Telegram server says - Bad Request: RICH_MESSAGE_EMPTY"),
            [sent_message],
        ])

        with patch("app.routers.block_preview.send_rich_message_preview", new=sender):
            result = await _send_single_block_preview(object(), 12345, block, None)

        self.assertEqual(result, [sent_message])
        self.assertEqual(sender.await_count, 2)
        self.assertEqual(sender.await_args_list[0].args[2], [block])

        retry_blocks = sender.await_args_list[1].args[2]
        self.assertEqual(len(retry_blocks), 2)
        self.assertIs(retry_blocks[0], block)
        self.assertEqual(retry_blocks[1]["type"], "footer")
        self.assertTrue(retry_blocks[1]["data"].get("text"))
        self.assertEqual(block, before)

    async def test_non_empty_preview_error_is_not_retried(self):
        block = make_block("paragraph", {"text": "hello"})
        sender = AsyncMock(side_effect=RichMessageRenderError(
            "Telegram server says - Bad Request: BUTTON_URL_INVALID"
        ))

        with patch("app.routers.block_preview.send_rich_message_preview", new=sender):
            with self.assertRaises(RichMessageRenderError):
                await _send_single_block_preview(object(), 12345, block, None)

        self.assertEqual(sender.await_count, 1)


if __name__ == "__main__":
    unittest.main()

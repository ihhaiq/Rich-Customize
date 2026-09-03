from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.keyboards.editor import build_rich_editor_keyboard
from app.routers.block_preview import _block_peek_text, _send_visual_peek


class BlockPeekTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _block(block_type: str, data: dict | None = None, block_id: str = "b1") -> dict:
        return {
            "id": block_id,
            "type": block_type,
            "position": 0,
            "data": data or {},
        }

    def test_editor_places_eye_button_beside_each_block(self):
        keyboard = build_rich_editor_keyboard([
            self._block("paragraph", {"text": "hello"}),
        ])

        row = next(
            row
            for row in keyboard.inline_keyboard
            if row[0].callback_data == "r:b:b1"
        )
        self.assertEqual(len(row), 2)
        self.assertEqual(row[1].text, "👁")
        self.assertEqual(row[1].callback_data, "r:peek:b1")

    def test_non_visual_media_peek_prefers_audio_title(self):
        block = self._block("audio", {
            "file": {
                "file_id": "audio-id",
                "performer": "Artist",
                "title": "Song",
                "file_name": "fallback.mp3",
            },
        })

        self.assertEqual(_block_peek_text(block), "Artist — Song")

    def test_document_peek_uses_file_name(self):
        block = self._block("document", {
            "file": {"file_id": "doc-id", "file_name": "report.pdf"},
        })

        self.assertEqual(_block_peek_text(block), "report.pdf")

    def test_text_and_anchor_peeks_show_identifying_content(self):
        paragraph = self._block("paragraph", {"text": "نص يميز هذا البلوك"})
        anchor = self._block("anchor", {
            "text": "anchor_123",
            "display_name": "قسم الأغاني",
        })

        self.assertEqual(_block_peek_text(paragraph), "نص يميز هذا البلوك")
        self.assertEqual(_block_peek_text(anchor), "قسم الأغاني")

    async def test_visual_peek_sends_photo_by_file_id(self):
        sent_message = SimpleNamespace(message_id=99)
        bot = SimpleNamespace(
            send_photo=AsyncMock(return_value=sent_message),
            send_video=AsyncMock(),
            send_animation=AsyncMock(),
        )
        block = self._block("photo", {
            "file": {"file_id": "photo-id"},
        })

        result = await _send_visual_peek(bot, 12345, block)

        self.assertIs(result, sent_message)
        bot.send_photo.assert_awaited_once_with(chat_id=12345, photo="photo-id")
        bot.send_video.assert_not_awaited()
        bot.send_animation.assert_not_awaited()

    async def test_non_visual_media_is_not_sent_as_file(self):
        bot = SimpleNamespace(
            send_photo=AsyncMock(),
            send_video=AsyncMock(),
            send_animation=AsyncMock(),
        )
        block = self._block("audio", {
            "file": {"file_id": "audio-id", "file_name": "track.mp3"},
        })

        result = await _send_visual_peek(bot, 12345, block)

        self.assertIsNone(result)
        bot.send_photo.assert_not_awaited()
        bot.send_video.assert_not_awaited()
        bot.send_animation.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()

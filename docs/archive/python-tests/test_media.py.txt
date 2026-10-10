import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.media import MediaStore, file_id, iter_media_blocks


class MediaStoreTests(unittest.TestCase):
    def _audio(self, file_id_value: str = "audio-file"):
        return {
            "id": "a1",
            "type": "audio",
            "position": 0,
            "data": {
                "file": {
                    "file_id": file_id_value,
                    "file_unique_id": "unique-audio",
                    "duration": 10,
                }
            },
        }

    def test_file_id_and_nested_media_are_normalized(self):
        audio = self._audio()
        details = {
            "id": "d1",
            "type": "details",
            "position": 0,
            "data": {"children": [audio]},
        }
        self.assertEqual(file_id(audio), "audio-file")
        self.assertEqual([item["id"] for item in iter_media_blocks([details])], ["a1"])

    def test_unpinned_media_expires_but_saved_page_media_is_kept(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "media.json"
            store = MediaStore(path=path, ttl=3600)
            audio = self._audio()

            with patch("app.services.media.time.time", return_value=1_000):
                store.remember_blocks([audio])
                store.pin_page("page-1", [audio])

            state = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(state["audio-file"]["page_refs"], ["page-1"])
            self.assertIsNone(state["audio-file"]["expires_at"])

            with patch("app.services.media.time.time", return_value=50_000):
                self.assertEqual(store.cleanup(), 0)
                store.unpin_page("page-1")

            state = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(state["audio-file"]["page_refs"], [])
            self.assertEqual(state["audio-file"]["expires_at"], 53_600)

            with patch("app.services.media.time.time", return_value=53_601):
                self.assertEqual(store.cleanup(), 1)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {})

    def test_overwriting_page_releases_media_no_longer_referenced(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "media.json"
            store = MediaStore(path=path, ttl=3600)
            first = self._audio("first")
            second = self._audio("second")

            with patch("app.services.media.time.time", return_value=1_000):
                store.remember_blocks([first, second])
                store.pin_page("page-x", [first])
            with patch("app.services.media.time.time", return_value=2_000):
                store.pin_page("page-x", [second])

            state = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(state["first"]["page_refs"], [])
            self.assertEqual(state["first"]["expires_at"], 5_600)
            self.assertEqual(state["second"]["page_refs"], ["page-x"])
            self.assertIsNone(state["second"]["expires_at"])


if __name__ == "__main__":
    unittest.main()

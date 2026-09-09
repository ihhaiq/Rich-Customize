import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.routers.developer import _developer_panel_rich_message
from app.services.data_import import configured_state_destinations
from app.services.showcase_channel import ShowcaseChannelStore


class ShowcaseChannelTests(unittest.TestCase):
    def test_store_loads_only_valid_message_snapshots(self):
        loaded = ShowcaseChannelStore._load({
            "messages": [
                {"message_id": 9, "text": "last"},
                {"message_id": 2, "text": "first"},
                {"message_id": 0, "text": "invalid"},
                {"message_id": "3", "text": "invalid"},
                "invalid",
            ],
        })

        self.assertEqual(sorted(loaded), [2, 9])
        self.assertEqual(loaded[2]["text"], "first")
        self.assertEqual(loaded[9]["text"], "last")

    def test_developer_panel_has_showcase_refresh_rich_button(self):
        payload = _developer_panel_rich_message("panel").model_dump(
            mode="json",
            exclude_none=True,
        )
        buttons = payload["blocks"][1]["buttons"]
        refresh = next(
            button for button in buttons
            if button["callback_data"] == "dev:showcase:refresh"
        )

        self.assertEqual(refresh["text"], "تحديث قناة المعاينة")
        self.assertEqual(refresh["style"], "primary")

    def test_showcase_channel_state_is_a_known_backup_destination(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {"SHOWCASE_CHANNEL_STATE": str(Path(directory) / "preview.json")},
        ):
            destinations = configured_state_destinations()

        self.assertEqual(
            destinations["showcase_channel.json"],
            Path(directory) / "preview.json",
        )


if __name__ == "__main__":
    unittest.main()

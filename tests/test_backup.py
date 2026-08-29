import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
from unittest.mock import patch

from app.config import developer_ids
from app.services.backup import build_data_backup


class DataBackupTests(unittest.TestCase):
    def test_developer_ids_accepts_one_or_multiple_admins(self):
        with patch.dict(
            "os.environ",
            {"DEVELOPER_IDS": "123, 456;invalid"},
            clear=False,
        ):
            self.assertEqual(developer_ids(), frozenset({123, 456}))

    def test_backup_contains_only_selected_data_and_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pages = root / "rich_pages.json"
            chats = root / "managed_chats.json"
            secret = root / ".env"
            pages.write_text('{"page":"value"}', encoding="utf-8")
            chats.write_text('{"users":{}}', encoding="utf-8")
            secret.write_text("BOT_TOKEN=secret", encoding="utf-8")

            backup = build_data_backup(
                [pages, chats],
                created_at=datetime(2026, 8, 29, 3, 4, 5, tzinfo=timezone.utc),
            )

            self.assertIsNotNone(backup)
            assert backup is not None
            self.assertEqual(
                backup.filename,
                "rich_customize_backup_20260829_030405_UTC.zip",
            )
            with ZipFile(BytesIO(backup.content)) as archive:
                names = set(archive.namelist())
                self.assertEqual(names, {
                    "data/rich_pages.json",
                    "data/managed_chats.json",
                    "manifest.json",
                })
                manifest = json.loads(archive.read("manifest.json"))
                self.assertEqual(manifest["file_count"], 2)
                self.assertNotIn(".env", "\n".join(names))

    def test_empty_backup_returns_none(self):
        self.assertIsNone(build_data_backup([]))

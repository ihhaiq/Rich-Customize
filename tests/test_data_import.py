import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

from app.config import developer_ids
from app.services.data_import import (
    DataImportError, apply_data_import, prepare_data_import,
)


def import_zip(files: dict[str, bytes]) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


class DataImportTests(unittest.TestCase):
    def test_developer_ids_accepts_one_or_multiple_admins(self):
        with patch.dict(
            "os.environ",
            {"DEVELOPER_IDS": "123, 456;invalid"},
            clear=False,
        ):
            self.assertEqual(developer_ids(), frozenset({123, 456}))

    def test_zip_import_accepts_only_known_valid_json(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {
                "RICH_PAGES_STATE": str(Path(directory) / "rich_pages.json"),
                "MANAGED_CHATS_STATE": str(Path(directory) / "managed_chats.json"),
            },
        ):
            payload = import_zip({
                "manifest.json": b'{"format":"rich-customize-json-backup-v1"}',
                "data/rich_pages.json": b'{"page":"value"}',
                "data/managed_chats.json": b'{"users":{}}',
            })

            prepared = prepare_data_import("backup.zip", payload)

            self.assertEqual(len(prepared), 2)
            self.assertIn(str(Path(directory) / "rich_pages.json"), prepared)
            self.assertIn(str(Path(directory) / "managed_chats.json"), prepared)

    def test_import_rejects_unknown_or_traversal_files(self):
        for name in ("data/secret.json", "../rich_pages.json"):
            with self.subTest(name=name):
                payload = import_zip({name: b"{}"})
                with self.assertRaises(DataImportError):
                    prepare_data_import("backup.zip", payload)

    def test_import_rejects_invalid_json_before_replacing_data(self):
        payload = import_zip({"data/rich_pages.json": b"{broken"})

        with self.assertRaises(DataImportError):
            prepare_data_import("backup.zip", payload)

    def test_apply_import_replaces_validated_file(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "rich_pages.json"
            destination.write_text('{"old":true}', encoding="utf-8")
            with patch.dict(os.environ, {"RICH_PAGES_STATE": str(destination)}):
                imported = apply_data_import({
                    str(destination): b'{"new":true}',
                })

            self.assertEqual(imported, ["rich_pages.json"])
            self.assertEqual(json.loads(destination.read_text()), {"new": True})

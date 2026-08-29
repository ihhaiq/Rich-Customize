import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

from app.config import developer_ids
from app.services.data_import import (
    DataImportError, apply_data_import, build_data_export, prepare_data_import,
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

    def test_export_is_directly_accepted_by_import(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {
                "RICH_PAGES_STATE": str(Path(directory) / "rich_pages.json"),
                "MANAGED_CHATS_STATE": str(Path(directory) / "managed_chats.json"),
                "RICH_MEDIA_STATE": str(Path(directory) / "missing_media.json"),
                "GUEST_MESSAGES_STATE": str(Path(directory) / "missing_guests.json"),
                "BUTTON_POPUPS_STATE": str(Path(directory) / "missing_popups.json"),
                "SHOWCASE_MEDIA_LIBRARY": str(Path(directory) / "missing_showcase.json"),
            },
        ):
            pages = Path(directory) / "rich_pages.json"
            chats = Path(directory) / "managed_chats.json"
            pages.write_text('{"page":"value"}', encoding="utf-8")
            chats.write_text('{"users":{}}', encoding="utf-8")

            exported = build_data_export(
                created_at=datetime(2026, 8, 29, 3, 4, 5, tzinfo=timezone.utc),
            )

            self.assertIsNotNone(exported)
            assert exported is not None
            self.assertEqual(
                exported.filename,
                "rich_customize_backup_20260829_030405_UTC.zip",
            )
            self.assertEqual(exported.file_count, 2)
            with ZipFile(BytesIO(exported.content)) as archive:
                self.assertEqual(set(archive.namelist()), {
                    "data/rich_pages.json",
                    "data/managed_chats.json",
                    "manifest.json",
                })
            prepared = prepare_data_import(exported.filename, exported.content)
            self.assertEqual(set(prepared), {str(pages), str(chats)})

    def test_empty_export_returns_none(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {
                variable: str(Path(directory) / f"missing_{index}.json")
                for index, (variable, _default) in enumerate((
                    ("RICH_PAGES_STATE", ""),
                    ("RICH_MEDIA_STATE", ""),
                    ("MANAGED_CHATS_STATE", ""),
                    ("GUEST_MESSAGES_STATE", ""),
                    ("BUTTON_POPUPS_STATE", ""),
                    ("SHOWCASE_MEDIA_LIBRARY", ""),
                ))
            },
        ):
            self.assertIsNone(build_data_export())

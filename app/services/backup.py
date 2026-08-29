from __future__ import annotations

import io
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


_CONFIGURED_STATES = (
    ("RICH_PAGES_STATE", "data/rich_pages.json"),
    ("RICH_MEDIA_STATE", "data/rich_media.json"),
    ("MANAGED_CHATS_STATE", "data/managed_chats.json"),
    ("GUEST_MESSAGES_STATE", "data/guest_messages.json"),
    ("BUTTON_POPUPS_STATE", "data/button_popups.json"),
    ("SHOWCASE_MEDIA_LIBRARY", "data/showcase_media.json"),
)


@dataclass(frozen=True, slots=True)
class DataBackup:
    filename: str
    content: bytes
    file_count: int
    source_size: int


def configured_data_files(data_dir: Path = Path("data")) -> list[Path]:
    """Return persistent bot data files without ever including secrets."""
    candidates = {
        Path(os.getenv(variable, default).strip() or default)
        for variable, default in _CONFIGURED_STATES
    }
    if data_dir.is_dir():
        candidates.update(data_dir.rglob("*.json"))
    return sorted(
        (path for path in candidates if path.is_file() and not path.is_symlink()),
        key=lambda path: str(path),
    )


def build_data_backup(
    paths: list[Path] | None = None,
    *,
    created_at: datetime | None = None,
) -> DataBackup | None:
    selected = configured_data_files() if paths is None else sorted(
        (Path(path) for path in paths if Path(path).is_file()),
        key=lambda path: str(path),
    )
    if not selected:
        return None

    timestamp = (created_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    archive_name = f"rich_customize_backup_{timestamp:%Y%m%d_%H%M%S}_UTC.zip"
    source_size = 0
    used_names: set[str] = set()
    manifest_files: list[dict[str, int | str]] = []
    output = io.BytesIO()

    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for index, path in enumerate(selected, start=1):
            payload = path.read_bytes()
            source_size += len(payload)
            member_name = path.name
            if member_name in used_names:
                member_name = f"{index}_{member_name}"
            used_names.add(member_name)
            archive.writestr(f"data/{member_name}", payload)
            manifest_files.append({"name": member_name, "size": len(payload)})

        manifest = {
            "created_at": timestamp.isoformat(),
            "format": "rich-customize-json-backup-v1",
            "file_count": len(manifest_files),
            "files": manifest_files,
        }
        archive.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
        )

    return DataBackup(
        filename=archive_name,
        content=output.getvalue(),
        file_count=len(selected),
        source_size=source_size,
    )

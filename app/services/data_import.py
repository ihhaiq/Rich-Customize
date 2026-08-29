from __future__ import annotations

import io
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile


MAX_IMPORT_ARCHIVE_BYTES = 20 * 1024 * 1024
MAX_IMPORT_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_IMPORT_FILES = 20
_CONFIGURED_STATES = (
    ("RICH_PAGES_STATE", "data/rich_pages.json"),
    ("RICH_MEDIA_STATE", "data/rich_media.json"),
    ("MANAGED_CHATS_STATE", "data/managed_chats.json"),
    ("GUEST_MESSAGES_STATE", "data/guest_messages.json"),
    ("BUTTON_POPUPS_STATE", "data/button_popups.json"),
    ("SHOWCASE_MEDIA_LIBRARY", "data/showcase_media.json"),
)


class DataImportError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class DataExport:
    filename: str
    content: bytes
    file_count: int
    source_size: int


def configured_state_destinations() -> dict[str, Path]:
    return {
        Path(default).name: Path(os.getenv(variable, default).strip() or default)
        for variable, default in _CONFIGURED_STATES
    }


def _validated_json(name: str, payload: bytes) -> bytes:
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise DataImportError(f"ملف {name} لا يحتوي JSON صالحًا.") from error
    if not isinstance(value, dict):
        raise DataImportError(f"ملف {name} يجب أن يبدأ بكائن JSON.")
    return payload


def build_data_export(*, created_at: datetime | None = None) -> DataExport | None:
    """Build an import-compatible ZIP from known persistent state files only."""
    selected = [
        (name, path)
        for name, path in configured_state_destinations().items()
        if path.is_file() and not path.is_symlink()
    ]
    if not selected:
        return None

    timestamp = (created_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    output = io.BytesIO()
    manifest_files: list[dict[str, int | str]] = []
    source_size = 0
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for name, path in sorted(selected):
            payload = _validated_json(name, path.read_bytes())
            source_size += len(payload)
            archive.writestr(f"data/{name}", payload)
            manifest_files.append({"name": name, "size": len(payload)})

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

    return DataExport(
        filename=f"rich_customize_backup_{timestamp:%Y%m%d_%H%M%S}_UTC.zip",
        content=output.getvalue(),
        file_count=len(manifest_files),
        source_size=source_size,
    )


def prepare_data_import(filename: str, payload: bytes) -> dict[str, bytes]:
    """Validate an uploaded ZIP/JSON and map it only to known state files."""
    if not payload:
        raise DataImportError("الملف فارغ.")
    if len(payload) > MAX_IMPORT_ARCHIVE_BYTES:
        raise DataImportError("حجم الملف أكبر من الحد المسموح وهو 20MB.")

    destinations = configured_state_destinations()
    lowered = filename.casefold()
    if lowered.endswith(".json"):
        basename = Path(filename).name
        destination = destinations.get(basename)
        if destination is None:
            raise DataImportError(f"اسم ملف البيانات غير معروف: {basename}")
        return {str(destination): _validated_json(basename, payload)}
    if not lowered.endswith(".zip"):
        raise DataImportError("أرسل ملف ZIP أو أحد ملفات JSON المعروفة.")

    imported: dict[str, bytes] = {}
    expanded_size = 0
    try:
        with ZipFile(io.BytesIO(payload)) as archive:
            files = [item for item in archive.infolist() if not item.is_dir()]
            if len(files) > MAX_IMPORT_FILES:
                raise DataImportError("الأرشيف يحتوي ملفات أكثر من الحد المسموح.")
            for item in files:
                member = PurePosixPath(item.filename)
                if (
                    member.is_absolute()
                    or ".." in member.parts
                    or len(member.parts) > 2
                    or (len(member.parts) == 2 and member.parts[0] != "data")
                ):
                    raise DataImportError(f"مسار غير مسموح داخل الأرشيف: {item.filename}")
                basename = member.name
                if basename == "manifest.json":
                    continue
                destination = destinations.get(basename)
                if destination is None:
                    raise DataImportError(f"ملف بيانات غير معروف داخل الأرشيف: {basename}")
                if str(destination) in imported:
                    raise DataImportError(f"ملف مكرر داخل الأرشيف: {basename}")
                if item.flag_bits & 0x1:
                    raise DataImportError("الأرشيف المشفّر بكلمة مرور غير مدعوم.")
                expanded_size += item.file_size
                if expanded_size > MAX_IMPORT_EXPANDED_BYTES:
                    raise DataImportError("حجم البيانات بعد فك الضغط أكبر من 50MB.")
                imported[str(destination)] = _validated_json(
                    basename, archive.read(item),
                )
    except BadZipFile as error:
        raise DataImportError("ملف ZIP تالف أو غير صالح.") from error

    if not imported:
        raise DataImportError("الأرشيف لا يحتوي أي ملف بيانات معروف.")
    return imported


def apply_data_import(files: dict[str, bytes]) -> list[str]:
    """Atomically replace validated state files and roll back on failure."""
    allowed = {str(path): path for path in configured_state_destinations().values()}
    selected: dict[Path, bytes] = {}
    for destination, payload in files.items():
        path = allowed.get(str(destination))
        if path is None:
            raise DataImportError(f"وجهة استيراد غير مسموحة: {destination}")
        selected[path] = _validated_json(path.name, payload)
    if not selected:
        raise DataImportError("لا توجد بيانات جاهزة للاستيراد.")

    originals: dict[Path, bytes | None] = {}
    temporaries: dict[Path, Path] = {}
    replaced: list[Path] = []
    try:
        for path, payload in selected.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            originals[path] = path.read_bytes() if path.exists() else None
            temporary = path.with_suffix(f"{path.suffix}.import")
            temporary.write_bytes(payload)
            temporaries[path] = temporary
        for path, temporary in temporaries.items():
            temporary.replace(path)
            replaced.append(path)
    except OSError:
        for path in reversed(replaced):
            original = originals[path]
            if original is None:
                path.unlink(missing_ok=True)
            else:
                rollback = path.with_suffix(f"{path.suffix}.rollback")
                rollback.write_bytes(original)
                rollback.replace(path)
        raise
    finally:
        for temporary in temporaries.values():
            temporary.unlink(missing_ok=True)

    return [path.name for path in selected]

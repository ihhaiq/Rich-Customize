from __future__ import annotations

from typing import Any

from aiohttp import web
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import BufferedInputFile

from app.services.page_registry import page_registry

MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_MEDIA_BYTES = 50 * 1024 * 1024
SUPPORTED_KINDS = {"photo", "video", "animation", "audio", "voice", "document"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

_KIND_LABELS = {
    "photo": "الصورة",
    "video": "الفيديو",
    "animation": "GIF",
    "audio": "الملف الصوتي",
    "voice": "الرسالة الصوتية",
    "document": "الملف",
}


def _safe_filename(value: str | None, fallback: str) -> str:
    filename = (value or fallback).rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip()
    return filename or fallback


async def _multipart_file(request: web.Request) -> tuple[bytes, str, str]:
    try:
        reader = await request.multipart()
    except (ValueError, AssertionError) as exc:
        raise web.HTTPBadRequest(text="Expected multipart file upload") from exc

    part = await reader.next()
    while part is not None and part.name != "file":
        part = await reader.next()
    if part is None:
        raise web.HTTPBadRequest(text="Missing upload file")

    content_type = (part.headers.get("Content-Type") or "application/octet-stream").split(";", 1)[0].lower()
    payload = await part.read(decode=False)
    if not payload:
        raise web.HTTPBadRequest(text="Empty upload file")
    filename = _safe_filename(part.filename, "upload.bin")
    return payload, filename, content_type


def _file_payload(media: Any) -> dict[str, Any]:
    result: dict[str, Any] = {
        "file_id": getattr(media, "file_id", None),
        "file_unique_id": getattr(media, "file_unique_id", None),
        "file_size": getattr(media, "file_size", None),
    }
    for key in (
        "width", "height", "duration", "performer", "title", "file_name",
        "mime_type", "supports_streaming",
    ):
        value = getattr(media, key, None)
        if value is not None:
            result[key] = value
    return {key: value for key, value in result.items() if value is not None}


async def _send_to_telegram(
    bot: Bot,
    *,
    user_id: int,
    kind: str,
    payload: bytes,
    filename: str,
):
    upload = BufferedInputFile(payload, filename=filename)
    caption = f"📎 تم رفع {_KIND_LABELS[kind]} من Mini App"

    if kind == "photo":
        message = await bot.send_photo(chat_id=user_id, photo=upload, caption=caption)
        media = message.photo[-1] if message.photo else None
    elif kind == "video":
        message = await bot.send_video(chat_id=user_id, video=upload, caption=caption)
        media = message.video
    elif kind == "animation":
        message = await bot.send_animation(chat_id=user_id, animation=upload, caption=caption)
        media = message.animation
    elif kind == "audio":
        message = await bot.send_audio(chat_id=user_id, audio=upload, caption=caption)
        media = message.audio
    elif kind == "voice":
        message = await bot.send_voice(chat_id=user_id, voice=upload, caption=caption)
        media = message.voice
    else:
        message = await bot.send_document(chat_id=user_id, document=upload, caption=caption)
        media = message.document

    if media is None or not getattr(media, "file_id", None):
        raise web.HTTPBadRequest(text="Telegram did not return a reusable file_id")
    return message, media


async def _upload_kind(request: web.Request, kind: str) -> web.Response:
    developer_user = request.app["developer_user"]
    user = developer_user(request)
    user_id = int(user["id"])
    if kind not in SUPPORTED_KINDS:
        raise web.HTTPBadRequest(text="Unsupported upload type")

    payload, filename, content_type = await _multipart_file(request)
    limit = MAX_PHOTO_BYTES if kind == "photo" else MAX_MEDIA_BYTES
    if len(payload) > limit:
        raise web.HTTPRequestEntityTooLarge(max_size=limit, actual_size=len(payload))

    if kind == "photo" and content_type not in ALLOWED_IMAGE_TYPES:
        raise web.HTTPBadRequest(text="Only JPEG, PNG, or WebP images are supported as photos")
    if kind == "video" and not content_type.startswith("video/"):
        raise web.HTTPBadRequest(text="Choose a video file")
    if kind == "animation" and content_type not in {"image/gif", "video/mp4"}:
        raise web.HTTPBadRequest(text="Choose a GIF or MP4 animation")
    if kind in {"audio", "voice"} and not content_type.startswith("audio/"):
        raise web.HTTPBadRequest(text="Choose an audio file")

    bot: Bot = request.app["bot"]
    try:
        message, media = await _send_to_telegram(
            bot,
            user_id=user_id,
            kind=kind,
            payload=payload,
            filename=filename,
        )
    except TelegramForbiddenError as exc:
        raise web.HTTPForbidden(
            text="افتح محادثة البوت الخاصة واضغط Start أولًا حتى يقدر يرسل الملف إلك."
        ) from exc
    except TelegramBadRequest as exc:
        raise web.HTTPBadRequest(text=f"Telegram rejected the {kind}: {exc}") from exc

    return web.json_response({
        "ok": True,
        "kind": kind,
        "content_type": content_type,
        "message_id": message.message_id,
        **_file_payload(media),
    })


async def upload_media(request: web.Request) -> web.Response:
    return await _upload_kind(request, str(request.match_info.get("kind") or "").lower())


async def upload_photo(request: web.Request) -> web.Response:
    # Compatibility route used by older cached Mini App builds.
    return await _upload_kind(request, "photo")


async def discard_editor_session(request: web.Request) -> web.Response:
    """Restore the page loaded at session start, or remove a new auto-saved draft."""
    developer_user = request.app["developer_user"]
    user = developer_user(request)
    owner_id = int(user["id"])

    try:
        payload = await request.json()
    except (ValueError, TypeError) as exc:
        raise web.HTTPBadRequest(text="Invalid discard payload") from exc
    if not isinstance(payload, dict):
        raise web.HTTPBadRequest(text="Discard payload must be an object")

    page_id = str(payload.get("page_id") or "").strip()
    existed_before = bool(payload.get("existed_before"))

    if existed_before:
        original = payload.get("original")
        if not page_id or not isinstance(original, dict):
            raise web.HTTPBadRequest(text="Missing original page snapshot")

        current_page = await page_registry.get(page_id)
        if not current_page or int(current_page.get("owner_id", 0)) != owner_id:
            raise web.HTTPNotFound(text="Page not found")

        blocks = original.get("blocks")
        buttons = original.get("buttons", [])
        if not isinstance(blocks, list) or not isinstance(buttons, list):
            raise web.HTTPBadRequest(text="Invalid original page snapshot")

        await page_registry.save(
            owner_id,
            str(original.get("title") or page_id)[:64],
            blocks,
            buttons,
            int(original.get("buttons_per_row") or 1),
            str(original.get("buttons_align") or "center"),
            page_id=page_id,
        )
        return web.json_response({"ok": True, "action": "restored", "page_id": page_id})

    # The session started as a new local draft. Auto-save may have created a
    # persistent page while the user was editing; remove only that new page.
    deleted = False
    if page_id:
        deleted = await page_registry.delete(page_id, owner_id)
    return web.json_response({"ok": True, "action": "discarded", "deleted": deleted})


def register_upload_routes(app: web.Application) -> None:
    app.router.add_post("/miniapp/api/upload/photo", upload_photo)
    app.router.add_post("/miniapp/api/upload/{kind}", upload_media)
    app.router.add_post("/miniapp/api/discard-session", discard_editor_session)

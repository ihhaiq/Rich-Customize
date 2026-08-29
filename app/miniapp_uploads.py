from __future__ import annotations

from aiohttp import web
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import BufferedInputFile

MAX_PHOTO_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


async def upload_photo(request: web.Request) -> web.Response:
    # Reuse the Mini App's authenticated developer gate supplied by miniapp.py.
    developer_user = request.app["developer_user"]
    user = developer_user(request)
    user_id = int(user["id"])

    try:
        reader = await request.multipart()
    except (ValueError, AssertionError) as exc:
        raise web.HTTPBadRequest(text="Expected multipart photo upload") from exc

    part = await reader.next()
    while part is not None and part.name != "file":
        part = await reader.next()
    if part is None:
        raise web.HTTPBadRequest(text="Missing photo file")

    content_type = (part.headers.get("Content-Type") or "").split(";", 1)[0].lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise web.HTTPBadRequest(text="Only JPEG, PNG, or WebP images are supported")

    payload = await part.read(decode=False)
    if not payload:
        raise web.HTTPBadRequest(text="Empty photo file")
    if len(payload) > MAX_PHOTO_BYTES:
        raise web.HTTPRequestEntityTooLarge(max_size=MAX_PHOTO_BYTES, actual_size=len(payload))

    filename = (part.filename or "photo.jpg").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if not filename:
        filename = "photo.jpg"

    bot: Bot = request.app["bot"]
    try:
        message = await bot.send_photo(
            chat_id=user_id,
            photo=BufferedInputFile(payload, filename=filename),
            caption="🖼 تم رفع الصورة من Mini App",
        )
    except TelegramForbiddenError as exc:
        raise web.HTTPForbidden(
            text="افتح محادثة البوت الخاصة واضغط Start أولًا حتى يقدر يرسل الصورة إلك."
        ) from exc
    except TelegramBadRequest as exc:
        raise web.HTTPBadRequest(text=f"Telegram rejected the photo: {exc}") from exc

    if not message.photo:
        raise web.HTTPBadRequest(text="Telegram did not return a reusable photo file_id")
    photo = message.photo[-1]
    return web.json_response({
        "ok": True,
        "file_id": photo.file_id,
        "file_unique_id": photo.file_unique_id,
        "width": photo.width,
        "height": photo.height,
        "file_size": photo.file_size,
        "message_id": message.message_id,
    })


def register_upload_routes(app: web.Application) -> None:
    app.router.add_post("/miniapp/api/upload/photo", upload_photo)

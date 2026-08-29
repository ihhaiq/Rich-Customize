from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from urllib.parse import parse_qsl

from aiohttp import web

from app.config import developer_ids
from app.services.page_registry import page_registry

STATIC_DIR = Path(__file__).with_name("miniapp_static")


def mini_app_url() -> str | None:
    explicit = os.getenv("MINI_APP_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip()
    if domain:
        return f"https://{domain}/miniapp"
    return None


def _verify_init_data(init_data: str, bot_token: str, max_age: int = 86400) -> dict:
    if not init_data:
        raise web.HTTPUnauthorized(text="Missing Telegram initData")
    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = fields.pop("hash", "")
    if not received_hash:
        raise web.HTTPUnauthorized(text="Missing initData hash")
    check = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise web.HTTPUnauthorized(text="Invalid Telegram initData")
    auth_date = int(fields.get("auth_date") or 0)
    if not auth_date or abs(int(time.time()) - auth_date) > max_age:
        raise web.HTTPUnauthorized(text="Expired Telegram initData")
    try:
        user = json.loads(fields.get("user") or "{}")
    except json.JSONDecodeError as exc:
        raise web.HTTPUnauthorized(text="Invalid Telegram user") from exc
    if not isinstance(user, dict) or not user.get("id"):
        raise web.HTTPUnauthorized(text="Missing Telegram user")
    return user


def _developer_user(request: web.Request) -> dict:
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = _verify_init_data(init_data, request.app["bot_token"])
    allowed = developer_ids()
    if not allowed or int(user["id"]) not in allowed:
        raise web.HTTPForbidden(text="Mini App beta is developer-only")
    return user


async def index(_: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


async def api_me(request: web.Request) -> web.Response:
    user = _developer_user(request)
    return web.json_response({"ok": True, "user": user, "beta": "0.2"})


async def api_pages(request: web.Request) -> web.Response:
    user = _developer_user(request)
    pages = await page_registry.list_for_user(int(user["id"]))
    return web.json_response({
        "ok": True,
        "beta": "0.2",
        "pages": [{
            "page_id": page["page_id"],
            "title": page.get("title") or page["page_id"],
            "updated_at": page.get("updated_at"),
            "block_count": len(page.get("blocks") or []),
        } for page in pages],
    })


async def api_page(request: web.Request) -> web.Response:
    user = _developer_user(request)
    page_id = request.match_info["page_id"]
    page = await page_registry.get(page_id)
    if not page or int(page.get("owner_id", 0)) != int(user["id"]):
        raise web.HTTPNotFound(text="Page not found")
    return web.json_response({"ok": True, "page": {"page_id": page_id, **page}})


async def api_save_page(request: web.Request) -> web.Response:
    user = _developer_user(request)
    page_id = request.match_info["page_id"]
    current = await page_registry.get(page_id)
    if not current or int(current.get("owner_id", 0)) != int(user["id"]):
        raise web.HTTPNotFound(text="Page not found")
    try:
        payload = await request.json()
    except (json.JSONDecodeError, ValueError):
        raise web.HTTPBadRequest(text="Invalid JSON")
    blocks = payload.get("blocks")
    if not isinstance(blocks, list):
        raise web.HTTPBadRequest(text="blocks must be a list")
    title = str(payload.get("title") or current.get("title") or page_id)[:64]
    code = await page_registry.save(
        int(user["id"]),
        title,
        blocks,
        current.get("buttons") or [],
        int(current.get("buttons_per_row") or 1),
        str(current.get("buttons_align") or "center"),
        page_id=page_id,
    )
    return web.json_response({"ok": True, "beta": "0.2", "page_id": code, "title": title})


def build_web_app(bot_token: str) -> web.Application:
    app = web.Application(client_max_size=2 * 1024 * 1024)
    app["bot_token"] = bot_token
    app.router.add_get("/miniapp", index)
    app.router.add_get("/miniapp/", index)
    app.router.add_static("/miniapp/static", STATIC_DIR)
    app.router.add_get("/miniapp/api/me", api_me)
    app.router.add_get("/miniapp/api/pages", api_pages)
    app.router.add_get("/miniapp/api/pages/{page_id}", api_page)
    app.router.add_put("/miniapp/api/pages/{page_id}", api_save_page)
    return app


async def start_mini_app_server(bot_token: str) -> web.AppRunner:
    app = build_web_app(bot_token)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    port = int(os.getenv("PORT", "8080"))
    site = web.TCPSite(runner, host="0.0.0.0", port=port)
    await site.start()
    return runner

from __future__ import annotations

import os
from pathlib import Path

from aiohttp import web
from aiogram import Bot

from app.storage import state_database
from app.webapp.auth import miniapp_user
from app.webapp.buttons import register_rich_button_routes
from app.webapp.constants import BETA_VERSION
from app.webapp.pages import register_page_routes
from app.webapp.uploads import register_upload_routes

STATIC_DIR = Path(__file__).resolve().parents[1] / "miniapp_static"


def mini_app_url() -> str | None:
    explicit = os.getenv("MINI_APP_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip()
    if domain:
        return f"https://{domain}/miniapp"
    return None


async def index(_: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


async def health(_: web.Request) -> web.Response:
    """Lightweight unauthenticated probe for Railway/container health checks."""
    database = state_database.status()
    return web.json_response({
        "ok": True,
        "service": "rich-customize",
        "beta": BETA_VERSION,
        "database": {
            "configured": database.configured,
            "connected": database.connected,
            "mode": database.mode,
            "pending_sync": database.pending_sync,
        },
    })


def build_web_app(bot: Bot, bot_token: str) -> web.Application:
    # 55 MB supports ordinary video/audio/document uploads. Per-kind limits are
    # enforced by app.webapp.uploads for every authenticated user.
    app = web.Application(client_max_size=55 * 1024 * 1024)
    app["bot"] = bot
    app["bot_token"] = bot_token
    app["miniapp_user"] = miniapp_user
    app.router.add_get("/healthz", health)
    app.router.add_get("/miniapp", index)
    app.router.add_get("/miniapp/", index)
    app.router.add_static("/miniapp/static", STATIC_DIR)
    register_page_routes(app)
    register_upload_routes(app)
    register_rich_button_routes(app)
    return app


async def start_mini_app_server(bot: Bot, bot_token: str) -> web.AppRunner:
    app = build_web_app(bot, bot_token)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    port = int(os.getenv("PORT", "8080"))
    site = web.TCPSite(runner, host="0.0.0.0", port=port)
    await site.start()
    return runner


__all__ = [
    "BETA_VERSION",
    "STATIC_DIR",
    "build_web_app",
    "health",
    "index",
    "mini_app_url",
    "start_mini_app_server",
]

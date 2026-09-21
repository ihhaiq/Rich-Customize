from __future__ import annotations

import os
from pathlib import Path

from aiohttp import web
from aiogram import Bot

from app.services.observability import (
    DB_LATENCY,
    REDIS_CONNECTED,
    memory_rss_bytes,
    prometheus_payload,
)
from app.services.runtime_redis import runtime_redis
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
    """Lightweight probe: process memory plus DB/Redis dependency state."""
    database = state_database.status()
    redis = runtime_redis.status()
    DB_LATENCY.set(float(database.latency_ms or 0))
    REDIS_CONNECTED.set(1 if redis.connected else 0)
    return web.json_response({
        "ok": True,
        "degraded": bool(
            (database.configured and not database.connected)
            or (redis.configured and not redis.connected)
        ),
        "service": "rich-customize",
        "beta": BETA_VERSION,
        "memory": {
            "rss_bytes": memory_rss_bytes(),
        },
        "database": {
            "configured": database.configured,
            "connected": database.connected,
            "mode": database.mode,
            "pending_sync": database.pending_sync,
            "latency_ms": database.latency_ms,
            "circuit_open": database.circuit_open,
        },
        "redis": {
            "configured": redis.configured,
            "connected": redis.connected,
        },
    })


async def metrics(_: web.Request) -> web.Response:
    payload, content_type = prometheus_payload()
    return web.Response(body=payload, headers={"Content-Type": content_type})


def build_web_app(bot: Bot, bot_token: str) -> web.Application:
    # 55 MB supports ordinary video/audio/document uploads. Per-kind limits are
    # enforced by app.webapp.uploads for every authenticated user.
    app = web.Application(client_max_size=55 * 1024 * 1024)
    app["bot"] = bot
    app["bot_token"] = bot_token
    app["miniapp_user"] = miniapp_user
    app.router.add_get("/healthz", health)
    app.router.add_get("/metrics", metrics)
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
    "metrics",
    "index",
    "mini_app_url",
    "start_mini_app_server",
]

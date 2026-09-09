from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from aiohttp import web


def verify_init_data(init_data: str, bot_token: str, max_age: int = 86400) -> dict:
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


def miniapp_user(request: web.Request) -> dict:
    """Return the authenticated Telegram user that opened the Mini App."""
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    return verify_init_data(init_data, request.app["bot_token"])


__all__ = ["miniapp_user", "verify_init_data"]

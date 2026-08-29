from __future__ import annotations

import os
import re
from urllib.parse import quote

_DEFAULT_SHORT_NAME = "editor"
_SHORT_NAME_RE = re.compile(r"^[A-Za-z0-9_]{1,64}$")


def mini_app_short_name() -> str:
    """Return the Telegram Direct/Named Mini App short name.

    The default is ``editor`` so the public link is stable. Configure a Direct
    Mini App with the same short name in BotFather, or override it with
    MINI_APP_SHORT_NAME.
    """
    value = os.getenv("MINI_APP_SHORT_NAME", _DEFAULT_SHORT_NAME).strip()
    if not _SHORT_NAME_RE.fullmatch(value):
        return _DEFAULT_SHORT_NAME
    return value


def direct_mini_app_link(bot_username: str, start_param: str | None = None) -> str:
    """Build a Telegram Direct Mini App link (requestAppWebView path)."""
    username = str(bot_username or "").strip().lstrip("@")
    if not username:
        raise ValueError("bot username is required")
    base = f"https://t.me/{username}/{mini_app_short_name()}"
    if not start_param:
        return base
    return f"{base}?startapp={quote(str(start_param), safe='_-')}"

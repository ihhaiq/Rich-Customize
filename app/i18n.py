"""Public localization facade.

Routers and services should import translation helpers from this module. The
runtime translator and Telegram bot-profile synchronization live in dedicated
modules so they can evolve independently.
"""
from __future__ import annotations

from app.i18n_profile import _base_profiles, _profiles, configure_bot_profile
from app.i18n_runtime import (
    EN,
    LocaleMiddleware,
    LocalizedBot,
    current_language,
    preserve_user_content,
    resolve_language,
    t,
    tr,
    use_language,
)

__all__ = [
    "EN",
    "LocaleMiddleware",
    "LocalizedBot",
    "_base_profiles",
    "_profiles",
    "configure_bot_profile",
    "current_language",
    "preserve_user_content",
    "resolve_language",
    "t",
    "tr",
    "use_language",
]

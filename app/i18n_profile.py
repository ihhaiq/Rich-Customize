from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from aiogram import Bot
from aiogram.exceptions import TelegramRetryAfter
from aiogram.types import BotCommand

from app.lang import PROFILES as LOCALE_PROFILES

logger = logging.getLogger(__name__)


def _base_profiles() -> dict[str | None, dict[str, Any]]:
    return {
        None: {
            "name": "Rich Message Editor - BETA",
            "description": "Create and customize Telegram Rich Messages with structured blocks, media, details, quotations, lists, tables, and previews.",
            "short": "Create and customize Telegram Rich Messages.",
            "commands": [
                BotCommand(command="editor", description="Start a new rich message"),
                BotCommand(command="draft", description="Show every Rich Block"),
                BotCommand(command="start", description="Open the bot"),
            ],
        },
        "en": {
            "name": "Rich Message Editor - BETA",
            "description": "Create and customize Telegram Rich Messages with structured blocks, media, details, quotations, lists, tables, and previews.",
            "short": "Create and customize Telegram Rich Messages.",
            "commands": [
                BotCommand(command="editor", description="Start a new rich message"),
                BotCommand(command="draft", description="Show every Rich Block"),
                BotCommand(command="start", description="Open the bot"),
            ],
        },
        "ar": {
            "name": "محرّر الرسائل الغنية - اصدار تجريبي",
            "description": "أنشئ وخصّص رسائل Telegram الغنية باستخدام البلوكات والوسائط والتفاصيل والاقتباسات والقوائم والجداول والمعاينة.",
            "short": "إنشاء وتخصيص رسائل Telegram الغنية.",
            "commands": [
                BotCommand(command="editor", description="بدء رسالة غنية جديدة"),
                BotCommand(command="draft", description="عرض قالب جميع البلوكات"),
                BotCommand(command="start", description="فتح البوت"),
            ],
        },
        "zh": {
            "name": "富消息编辑器 - BETA",
            "description": "使用结构化区块、媒体、详情、引用、列表、表格和预览来创建并自定义 Telegram 富消息。",
            "short": "创建并自定义 Telegram 富消息。",
            "commands": [
                BotCommand(command="editor", description="开始创建新的富消息"),
                BotCommand(command="draft", description="显示所有富消息区块"),
                BotCommand(command="start", description="打开机器人"),
            ],
        },
    }


def _profiles() -> dict[str | None, dict[str, Any]]:
    profiles = _base_profiles()
    for language_code, profile in LOCALE_PROFILES.items():
        commands = profile.get("commands") or {}
        beta_name = f"{profile['name']} - BETA"
        profiles[language_code] = {
            "name": beta_name[:64],
            "description": str(profile["description"]),
            "short": str(profile["short"]),
            "commands": [
                BotCommand(command="editor", description=str(commands["editor"])),
                BotCommand(command="draft", description=str(commands["draft"])),
                BotCommand(command="start", description=str(commands["start"])),
            ],
        }
    return profiles


def _profile_state_path(bot: Bot) -> Path:
    configured = os.getenv("BOT_PROFILE_STATE", "").strip()
    return Path(configured) if configured else Path("data") / f"bot_profile_state_{bot.id}.json"


def _load_profile_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _save_profile_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def _profile_signature(profiles: dict[str | None, dict[str, Any]]) -> str:
    serializable: dict[str, Any] = {}
    for language_code, profile in profiles.items():
        serializable[language_code or "default"] = {
            "name": profile["name"],
            "description": profile["description"],
            "short": profile["short"],
            "commands": [
                {"command": command.command, "description": command.description}
                for command in profile["commands"]
            ],
        }
    raw = json.dumps(serializable, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _same_commands(current: list[BotCommand], desired: list[BotCommand]) -> bool:
    return [(item.command, item.description) for item in current] == [
        (item.command, item.description) for item in desired
    ]


async def configure_bot_profile(bot: Bot) -> None:
    profiles = _profiles()
    signature = _profile_signature(profiles)
    state_path = _profile_state_path(bot)
    state = _load_profile_state(state_path)
    if state.get("applied_signature") == signature:
        logger.info("Bot profile is already configured; skipping profile API calls")
        return

    now = int(time.time())
    retry_after_until = int(state.get("retry_after_until", 0) or 0)
    if retry_after_until > now:
        logger.warning(
            "Bot profile setup is paused by Telegram flood control; retry in %s seconds",
            retry_after_until - now,
        )
        return

    completed = True
    for language_code, profile in profiles.items():
        try:
            current_name = await bot.get_my_name(language_code=language_code)
            if current_name.name != profile["name"]:
                await bot.set_my_name(
                    name=profile["name"],
                    language_code=language_code,
                )

            current_description = await bot.get_my_description(
                language_code=language_code,
            )
            if current_description.description != profile["description"]:
                await bot.set_my_description(
                    description=profile["description"],
                    language_code=language_code,
                )

            current_short = await bot.get_my_short_description(
                language_code=language_code,
            )
            if current_short.short_description != profile["short"]:
                await bot.set_my_short_description(
                    short_description=profile["short"],
                    language_code=language_code,
                )

            current_commands = await bot.get_my_commands(language_code=language_code)
            if not _same_commands(current_commands, profile["commands"]):
                await bot.set_my_commands(
                    commands=profile["commands"],
                    language_code=language_code,
                )
        except TelegramRetryAfter as error:
            retry_after = max(int(error.retry_after), 1)
            _save_profile_state(
                state_path,
                {
                    "applied_signature": state.get("applied_signature"),
                    "retry_after_until": int(time.time()) + retry_after + 5,
                },
            )
            logger.warning(
                "Telegram paused bot profile changes; retry in %s seconds",
                retry_after,
            )
            return
        except Exception:
            completed = False
            logger.exception(
                "Failed to configure bot profile for language=%s",
                language_code or "default",
            )

    if completed:
        _save_profile_state(
            state_path,
            {"applied_signature": signature, "retry_after_until": 0},
        )
        logger.info(
            "Bot profile configuration is up to date for %s locales",
            len(profiles),
        )


__all__ = ["_base_profiles", "_profiles", "configure_bot_profile"]

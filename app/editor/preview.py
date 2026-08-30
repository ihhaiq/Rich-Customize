from __future__ import annotations

from typing import Any

from aiogram import Bot

from app.editor.workflow import editor_workflow
from app.services.renderer import send_rich_message_preview


async def send_preview(
    bot: Bot,
    chat_id: int,
    blocks: list[dict[str, Any]],
    **kwargs: Any,
):
    errors = editor_workflow.validate(blocks)
    if errors:
        raise ValueError("; ".join(errors))
    return await send_rich_message_preview(bot, chat_id, blocks, **kwargs)


__all__ = ["send_preview"]

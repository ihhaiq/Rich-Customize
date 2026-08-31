from __future__ import annotations

import logging

from aiogram import Bot, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.types import InlineQuery, InlineQueryResultArticle, InputRichMessageContent, Message

from app.services.buttons import normalize_page_code
from app.services.renderer import RichMessageRenderError, build_input_rich_message

from app.routers.publish_support import chat_type_value
from app.services.guest_message_registry import guest_message_registry
from app.services.page_registry import page_registry
from app.routers.button_support import prepare_message_buttons


router = Router(name="page_delivery")
logger = logging.getLogger(__name__)


async def saved_page_query_result(page_id: str) -> InlineQueryResultArticle | None:
    page = await page_registry.get(page_id)
    if page is None:
        return None
    prepared_buttons = await prepare_message_buttons(page.get("buttons") or [])
    rich_message = build_input_rich_message(
        page.get("blocks") or [],
        prepared_buttons,
        buttons_per_row=int(page.get("buttons_per_row", 1)),
        buttons_align=str(page.get("buttons_align", "center")),
        source_page_id=page_id,
    )
    return InlineQueryResultArticle(
        id=f"page-{page_id}",
        title=str(page.get("title") or page_id),
        description=f"رسالة غنية محفوظة · {page_id}",
        input_message_content=InputRichMessageContent(rich_message=rich_message),
    )


@router.inline_query()
async def find_saved_page_inline(query: InlineQuery) -> None:
    raw_code = query.query.strip().split(maxsplit=1)[0] if query.query.strip() else ""
    page_id = normalize_page_code(raw_code) or "" if raw_code else ""
    if not page_id:
        await query.answer([], cache_time=0, is_personal=True)
        return
    try:
        result = await saved_page_query_result(page_id)
    except (RichMessageRenderError, ValueError):
        logger.exception("Failed to render inline page_id=%s", page_id)
        await query.answer([], cache_time=0, is_personal=True)
        return
    if result is None:
        await query.answer([], cache_time=0, is_personal=True)
        return
    await query.answer([result], cache_time=0, is_personal=True)


@router.guest_message()
async def summon_saved_rich_page(message: Message, bot: Bot) -> None:
    if not message.guest_query_id:
        return
    try:
        result = None
        for token in (message.text or message.caption or "").split():
            if token.startswith("@"):
                continue
            candidate = normalize_page_code(token.strip(".,،؛:!?؟")) or ""
            if candidate:
                result = await saved_page_query_result(candidate)
                if result is not None:
                    break
        if result is None:
            return
        sent = await bot.answer_guest_query(
            guest_query_id=message.guest_query_id,
            result=result,
        )
        await guest_message_registry.remember(
            sent.inline_message_id,
            message.chat.id,
            chat_type_value(message.chat),
        )
    except (RichMessageRenderError, TelegramAPIError, ValueError):
        logger.exception("Failed to answer guest query with a saved rich page")


__all__ = [
    "find_saved_page_inline",
    "router",
    "saved_page_query_result",
    "summon_saved_rich_page",
]

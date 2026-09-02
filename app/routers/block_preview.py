from __future__ import annotations

import logging
from typing import Any

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.editor.models import make_block
from app.i18n import t
from app.services.blocks import get_block_by_id, get_block_label
from app.services.media import media_store
from app.services.renderer import RichMessageRenderError, send_rich_message_preview

router = Router(name="block_preview")
logger = logging.getLogger(__name__)


def _is_empty_rich_message_error(error: BaseException) -> bool:
    message = str(error)
    return (
        "RICH_MESSAGE_EMPTY" in message.upper()
        or "rich message must be non-empty" in message.lower()
    )


def _standalone_preview_blocks(block: dict[str, Any]) -> list[dict[str, Any]]:
    """Add preview-only context for blocks Telegram rejects when sent alone.

    Structural blocks such as a divider or anchor can be valid inside a rich
    message while Telegram still considers the same block an empty standalone
    message. The footer exists only in the transient preview payload; the stored
    editor block is never modified.
    """
    try:
        position = int(block.get("position", 0)) + 1
    except (TypeError, ValueError):
        position = 1
    context = make_block(
        "footer",
        {"text": t("ux.editor.preview"), "parse_inline_buttons": False},
        position=position,
    )
    return [block, context]


async def _send_single_block_preview(
    bot: Bot,
    chat_id: int,
    block: dict[str, Any],
    source_page_id: str | None,
) -> list:
    try:
        return await send_rich_message_preview(
            bot,
            chat_id,
            [block],
            buttons=None,
            buttons_per_row=1,
            buttons_align="center",
            source_page_id=source_page_id,
        ) or []
    except RichMessageRenderError as error:
        if not _is_empty_rich_message_error(error):
            raise
        logger.info(
            "Retrying standalone rich block preview with context block_id=%s type=%s",
            block.get("id"),
            block.get("type"),
        )
        return await send_rich_message_preview(
            bot,
            chat_id,
            _standalone_preview_blocks(block),
            buttons=None,
            buttons_per_row=1,
            buttons_align="center",
            source_page_id=source_page_id,
        ) or []


@router.callback_query(F.data.startswith("r:pv:"))
async def preview_one_block(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    blocks = data.get("blocks") or []
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None:
        await callback.answer(t("editor.block_missing"), show_alert=True)
        return

    await callback.answer(t("editor.preview_generating"))
    media_store.remember_blocks([block])

    preview_ids = dict(data.get("block_preview_message_ids") or {})
    old_ids = preview_ids.get(block_id) or []
    if isinstance(old_ids, int):
        old_ids = [old_ids]
    for message_id in old_ids:
        try:
            await bot.delete_message(chat_id=callback.from_user.id, message_id=int(message_id))
        except (TelegramBadRequest, TypeError, ValueError):
            pass

    try:
        sent = await _send_single_block_preview(
            bot,
            callback.from_user.id,
            block,
            data.get("current_page_id"),
        )
    except RichMessageRenderError as error:
        logger.exception(
            "Single block preview failed block_id=%s user_id=%s",
            block_id,
            callback.from_user.id,
        )
        await bot.send_message(
            callback.from_user.id,
            f"{t('editor.preview_failed_single')}\n{t('common.reason', reason=error)}",
        )
        return
    except Exception:
        logger.exception(
            "Unexpected single block preview failure block_id=%s user_id=%s",
            block_id,
            callback.from_user.id,
        )
        await bot.send_message(callback.from_user.id, t("editor.preview_failed"))
        return

    label = get_block_label(str(block.get("type")))
    notice = await bot.send_message(
        callback.from_user.id,
        t("editor.preview_single_notice", label=label),
    )
    preview_ids[block_id] = [
        *[message.message_id for message in sent],
        notice.message_id,
    ]
    await state.update_data(block_preview_message_ids=preview_ids)

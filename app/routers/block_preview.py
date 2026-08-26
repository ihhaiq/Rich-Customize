from __future__ import annotations

import logging

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.services.blocks import BLOCK_LABELS, get_block_by_id
from app.services.media import media_store
from app.services.renderer import RichMessageRenderError, send_rich_message_preview

router = Router(name="block_preview")
logger = logging.getLogger(__name__)


@router.callback_query(F.data.startswith("r:pv:"))
async def preview_one_block(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    blocks = data.get("blocks") or []
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        return

    await callback.answer("جاري إنشاء معاينة الجزء…")
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
        sent = await send_rich_message_preview(
            bot,
            callback.from_user.id,
            [block],
            buttons=None,
            buttons_per_row=1,
            buttons_align="center",
            source_page_id=data.get("current_page_id"),
        ) or []
    except RichMessageRenderError as error:
        logger.exception(
            "Single block preview failed block_id=%s user_id=%s",
            block_id,
            callback.from_user.id,
        )
        await bot.send_message(
            callback.from_user.id,
            f"تعذرت معاينة هذا الجزء وحده.\nالسبب: {error}",
        )
        return
    except Exception:
        logger.exception(
            "Unexpected single block preview failure block_id=%s user_id=%s",
            block_id,
            callback.from_user.id,
        )
        await bot.send_message(callback.from_user.id, "تعذرت معاينة هذا الجزء.")
        return

    preview_ids[block_id] = [message.message_id for message in sent]
    await state.update_data(block_preview_message_ids=preview_ids)
    label = BLOCK_LABELS.get(str(block.get("type")), "📦 محتوى")
    await bot.send_message(
        callback.from_user.id,
        f"👁 معاينة {label} فقط.\nالمعاينة الشاملة ما تغيرت وتبقى من زر «✅ النتيجة».",
    )

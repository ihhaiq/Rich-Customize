from __future__ import annotations

import copy
import logging

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.i18n import t
from app.services.html_export import has_export_content, send_html_export
from app.services.renderer import build_input_rich_message_html


router = Router(name="editor_export")
logger = logging.getLogger(__name__)


@router.callback_query(F.data == "r:exporthtml")
async def export_html(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    acknowledged = False
    try:
        # تحميل المسودة الاعتيادي يحدّث موضع التمرير؛ التصدير يقرأ فقط.
        data = copy.deepcopy(await state.get_data())
        blocks = data.get("blocks")
        if not isinstance(blocks, list):
            await callback.answer(t("expired"), show_alert=True)
            return
        if not blocks:
            await callback.answer(t("editor.html_export_empty"), show_alert=True)
            return
        rich = build_input_rich_message_html(blocks, source_page_id=data.get("current_page_id"))
        code = rich.html or ""
        if not has_export_content(code):
            await callback.answer(t("editor.html_export_empty"), show_alert=True)
            return
        await callback.answer()
        acknowledged = True
        await send_html_export(
            bot, callback.from_user.id, code, page_title=data.get("current_page_title"),
        )
    except Exception:
        logger.exception("HTML export failed for user_id=%s", callback.from_user.id)
        try:
            if acknowledged:
                await bot.send_message(callback.from_user.id, t("editor.html_export_failed"))
            else:
                await callback.answer(t("editor.html_export_failed"), show_alert=True)
        except Exception:
            logger.exception("Could not report HTML export failure for user_id=%s", callback.from_user.id)

from __future__ import annotations

import logging

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.i18n import tr
from app.keyboards import build_post_back_keyboard
from app.services.chat_registry import managed_chat_registry
from app.services.publish_ui import build_post_settings_rich_message, edit_publish_ui
from app.services.renderer import RichMessageRenderError, send_rich_message_post

from app.editor.session import load_editor_session, user_locks
from app.routers.button_support import prepare_message_buttons
from app.routers.editor_ui import friendly_rich_error
from app.routers.publish_support import can_publish_to_chat


router = Router(name="publish_actions")
logger = logging.getLogger(__name__)


@router.callback_query(F.data == "r:postsend")
async def send_post(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    if not callback.from_user:
        return
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session or not isinstance(callback.message, Message):
            return
        data, _ = session
        draft = await draft_store.load(state)
        selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
        if not selected:
            await callback.answer(tr("حدد محادثة واحدة على الأقل."), show_alert=True)
            return
        await callback.answer(tr("جاري إرسال المنشور…"))
        registered = {
            int(chat["chat_id"]): chat
            for chat in await managed_chat_registry.list_for_user(callback.from_user.id)
        }
        prepared_buttons = await prepare_message_buttons(draft.message_buttons)
        succeeded: list[str] = []
        failed: list[str] = []
        failed_reasons: list[str] = []
        for chat_id in selected:
            title = str(registered.get(chat_id, {}).get("title") or chat_id)
            if not await can_publish_to_chat(bot, chat_id, callback.from_user.id):
                await managed_chat_registry.remove(callback.from_user.id, chat_id)
                failed.append(title)
                continue
            try:
                await send_rich_message_post(
                    bot,
                    chat_id,
                    draft.blocks,
                    buttons=prepared_buttons,
                    buttons_per_row=draft.buttons_per_row,
                    buttons_align=draft.buttons_align,
                    disable_notification=bool(data.get("post_silent", False)),
                    protect_content=bool(data.get("post_protected", False)),
                    source_page_id=draft.current_page_id,
                )
            except (RichMessageRenderError, TelegramAPIError) as error:
                logger.exception(
                    "Failed to publish rich message to chat_id=%s for user_id=%s: %s",
                    chat_id,
                    callback.from_user.id,
                    error,
                )
                failed.append(title)
                failed_reasons.append(friendly_rich_error(error))
            else:
                succeeded.append(title)

        lines = [
            tr("نتيجة الإرسال:"),
            f"✅ {tr('نجح: ')}{len(succeeded)}",
            f"❌ {tr('فشل: ')}{len(failed)}",
        ]
        lines.extend(f"✅ {title}" for title in succeeded[:10])
        lines.extend(f"❌ {title}" for title in failed[:10])
        if failed_reasons:
            lines.append(f"\n{tr('سبب الفشل: ')}{failed_reasons[0]}")
        if len(succeeded) + len(failed) > 20:
            lines.append(tr("… تم اختصار قائمة النتائج"))
        lines.append(f"\n{tr('يمكنك تغيير الإعدادات وإرسال المنشور مرة أخرى.')}")
        await edit_publish_ui(
            callback.message,
            build_post_settings_rich_message(
                "\n".join(lines),
                silent=bool(data.get("post_silent", False)),
                protected=bool(data.get("post_protected", False)),
                selected_count=len(selected),
            ),
            build_post_back_keyboard("r:postlist"),
        )


__all__ = ["router", "send_post"]

from __future__ import annotations

import asyncio
import logging

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.types import BufferedInputFile, CallbackQuery, Message

from app.config import developer_ids
from app.keyboards import build_developer_keyboard
from app.services.backup import build_data_backup


router = Router(name="developer")
logger = logging.getLogger(__name__)
_backup_lock = asyncio.Lock()


def _is_developer(user_id: int | None) -> bool:
    return user_id is not None and user_id in developer_ids()


@router.message(Command("dev"))
async def open_developer_panel(message: Message) -> None:
    user_id = message.from_user.id if message.from_user else None
    if not _is_developer(user_id):
        return
    await message.answer(
        "🛠 لوحة المطوّر\n\n"
        "تقدر تنزّل نسخة احتياطية من ملفات بيانات البوت الحالية. "
        "النسخة لا تحتوي التوكن أو متغيرات البيئة.",
        reply_markup=build_developer_keyboard(),
    )


@router.callback_query(F.data == "dev:backup")
async def send_data_backup(callback: CallbackQuery) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    if not isinstance(callback.message, Message):
        await callback.answer()
        return
    if _backup_lock.locked():
        await callback.answer("جاري إنشاء نسخة احتياطية أخرى.", show_alert=True)
        return

    await callback.answer("جاري تجهيز النسخة الاحتياطية…")
    async with _backup_lock:
        try:
            backup = await asyncio.to_thread(build_data_backup)
            if backup is None:
                await callback.message.answer("لا توجد ملفات بيانات لإنشاء نسخة احتياطية.")
                return
            document = BufferedInputFile(backup.content, filename=backup.filename)
            await callback.message.answer_document(
                document,
                caption=(
                    "✅ اكتملت النسخة الاحتياطية\n"
                    f"عدد ملفات البيانات: {backup.file_count}\n"
                    f"الحجم قبل الضغط: {backup.source_size:,} بايت\n\n"
                    "احتفظ بهذا الملف بمكان آمن."
                ),
            )
        except (OSError, TelegramAPIError):
            logger.exception("Could not create or send developer data backup")
            await callback.message.answer("تعذر إنشاء النسخة الاحتياطية. راجع سجل البوت.")

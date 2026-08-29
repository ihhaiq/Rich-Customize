from __future__ import annotations

import asyncio
import io
import logging

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from app.config import developer_ids
from app.keyboards import (
    build_developer_import_confirmation_keyboard, build_developer_keyboard,
)
from app.services.data_import import (
    DataImportError, MAX_IMPORT_ARCHIVE_BYTES, apply_data_import,
    prepare_data_import,
)
from app.services.media_library import showcase_media_library
from app.services.page_registry import page_registry


router = Router(name="developer")
logger = logging.getLogger(__name__)
_import_lock = asyncio.Lock()


class DeveloperStates(StatesGroup):
    waiting_import = State()
    confirming_import = State()


def _is_developer(user_id: int | None) -> bool:
    return user_id is not None and user_id in developer_ids()


@router.message(Command("dev"))
async def open_developer_panel(message: Message, state: FSMContext) -> None:
    user_id = message.from_user.id if message.from_user else None
    if not _is_developer(user_id):
        return
    await state.clear()
    await message.answer(
        "🛠 لوحة المطوّر\n\n"
        "تقدر ترفع ملف ZIP أو ملف JSON لاستيراد بيانات البوت. "
        "سيتم فحصه وعرض تأكيد قبل استبدال أي بيانات.",
        reply_markup=build_developer_keyboard(),
    )


@router.callback_query(F.data == "dev:import")
async def request_data_import(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    await state.set_state(DeveloperStates.waiting_import)
    await state.update_data(pending_import_files=None)
    if isinstance(callback.message, Message):
        await callback.message.answer(
            "📤 أرسل الآن ملف النسخة بصيغة ZIP، أو ملف JSON معروف مثل "
            "rich_pages.json.\n\nالحد الأقصى للملف: 20MB."
        )
    await callback.answer()


@router.message(DeveloperStates.waiting_import, F.document)
async def receive_data_import(message: Message, state: FSMContext) -> None:
    user_id = message.from_user.id if message.from_user else None
    if not _is_developer(user_id) or message.document is None:
        return
    if (
        message.document.file_size is not None
        and message.document.file_size > MAX_IMPORT_ARCHIVE_BYTES
    ):
        await message.answer("حجم الملف أكبر من الحد المسموح وهو 20MB.")
        return

    buffer = io.BytesIO()
    try:
        await message.bot.download(message.document, destination=buffer)
        prepared = await asyncio.to_thread(
            prepare_data_import,
            message.document.file_name or "data.zip",
            buffer.getvalue(),
        )
    except DataImportError as error:
        await message.answer(f"❌ تعذر قبول الملف:\n{error}")
        return
    except (OSError, TelegramAPIError):
        logger.exception("Could not download developer data import")
        await message.answer("تعذر تنزيل الملف من Telegram. حاول مجددًا.")
        return

    await state.set_state(DeveloperStates.confirming_import)
    await state.update_data(pending_import_files=prepared)
    names = "\n".join(f"• {path.rsplit('/', 1)[-1]}" for path in prepared)
    await message.answer(
        "⚠️ الملف صالح وجاهز للاستيراد.\n\n"
        f"الملفات التي سيتم استبدالها:\n{names}\n\n"
        "لن يتم الاستبدال إلا بعد الضغط على زر التأكيد.",
        reply_markup=build_developer_import_confirmation_keyboard(),
    )
    try:
        await message.delete()
    except TelegramBadRequest:
        pass


@router.message(DeveloperStates.waiting_import)
async def reject_non_document_import(message: Message) -> None:
    user_id = message.from_user.id if message.from_user else None
    if _is_developer(user_id):
        await message.answer("أرسل ملف ZIP أو JSON كمستند.")


@router.callback_query(
    DeveloperStates.confirming_import,
    F.data == "dev:import:confirm",
)
async def confirm_data_import(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    if _import_lock.locked():
        await callback.answer("توجد عملية استيراد قيد التنفيذ.", show_alert=True)
        return
    data = await state.get_data()
    prepared = data.get("pending_import_files")
    if not isinstance(prepared, dict) or not prepared:
        await state.clear()
        await callback.answer("انتهت صلاحية الملف؛ ارفعه مجددًا.", show_alert=True)
        return

    await callback.answer("جاري استيراد البيانات…")
    async with _import_lock:
        try:
            imported = await asyncio.to_thread(apply_data_import, prepared)
            await showcase_media_library.reload()
            await page_registry.rebuild_media_pins()
        except (DataImportError, OSError):
            logger.exception("Could not apply developer data import")
            if isinstance(callback.message, Message):
                await callback.message.answer(
                    "تعذر استيراد البيانات، وتمت محاولة إعادة الملفات القديمة."
                )
            return

    await state.clear()
    if isinstance(callback.message, Message):
        await callback.message.answer(
            "✅ تم استيراد البيانات بنجاح.\n"
            f"عدد الملفات المستبدلة: {len(imported)}",
            reply_markup=build_developer_keyboard(),
        )


@router.callback_query(F.data == "dev:import:cancel")
async def cancel_data_import(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    await state.clear()
    if isinstance(callback.message, Message):
        await callback.message.answer(
            "تم إلغاء الاستيراد.", reply_markup=build_developer_keyboard(),
        )
    await callback.answer()

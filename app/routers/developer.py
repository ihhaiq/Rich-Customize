from __future__ import annotations

import asyncio
import io
import logging
from datetime import datetime, timezone

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import BufferedInputFile, CallbackQuery, InputRichMessage, Message

from app.config import developer_ids
from app.keyboards import (
    build_developer_import_confirmation_keyboard, build_developer_keyboard,
)
from app.services.data_import import (
    DataImportError, MAX_IMPORT_ARCHIVE_BYTES, apply_data_import,
    build_data_export, prepare_data_import,
)
from app.services.media_library import showcase_media_library
from app.services.page_registry import page_registry
from app.services.showcase_channel import showcase_channel_store
from app.services.usage_stats import usage_stats
from app.storage import state_database


router = Router(name="developer")
logger = logging.getLogger(__name__)
_import_lock = asyncio.Lock()
_export_lock = asyncio.Lock()


class DeveloperStates(StatesGroup):
    waiting_import = State()
    confirming_import = State()


def _is_developer(user_id: int | None) -> bool:
    return user_id is not None and user_id in developer_ids()


def _developer_panel_rich_message(
    text: str,
    extra_buttons: list[dict[str, str]] | None = None,
) -> InputRichMessage:
    blocks: list[dict[str, object]] = [
        {"type": "paragraph", "text": text},
        {
            "type": "buttons",
            "buttons": [
                {
                    "text": "فحص قاعدة البيانات",
                    "callback_data": "dev:database:check",
                    "style": "primary",
                },
                {
                    "text": "تحديث قناة المعاينة",
                    "callback_data": "dev:showcase:refresh",
                    "style": "primary",
                },
                {
                    "text": "بيانات / إحصائيات",
                    "callback_data": "dev:stats",
                    "style": "primary",
                },
            ],
            "align": "center",
        },
    ]
    if extra_buttons:
        blocks.append({
            "type": "buttons",
            "buttons": extra_buttons,
            "align": "center",
        })
    return InputRichMessage(blocks=blocks)


async def _send_developer_panel(
    message: Message,
    text: str,
    *,
    extra_buttons: list[dict[str, str]] | None = None,
) -> None:
    await message.bot.send_rich_message(
        chat_id=message.chat.id,
        rich_message=_developer_panel_rich_message(text, extra_buttons),
        reply_markup=build_developer_keyboard(),
    )


@router.message(Command("dev"))
async def open_developer_panel(message: Message, state: FSMContext) -> None:
    user_id = message.from_user.id if message.from_user else None
    if not _is_developer(user_id):
        return
    await state.clear()
    await _send_developer_panel(
        message,
        "🛠 لوحة المطوّر\n\n"
        "تقدر تصدّر بيانات البوت الحالية كملف ZIP، أو ترفع ملف ZIP/JSON "
        "لاستيرادها، وتفحص اتصال PostgreSQL أو تعيد ربطه من الزر المخصص، "
        "وتحدّث كاش قناة المعاينة بعد إضافة أو حذف محتوى منها. "
        "الاستيراد يُفحص ويطلب تأكيدًا قبل استبدال أي بيانات.\n\n"
        "ملف التصدير لا يحتوي التوكن أو متغيرات البيئة.",
    )


@router.callback_query(F.data == "dev:export")
async def send_data_export(callback: CallbackQuery) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    if not isinstance(callback.message, Message):
        await callback.answer()
        return
    if _export_lock.locked():
        await callback.answer("توجد عملية تصدير قيد التنفيذ.", show_alert=True)
        return

    await callback.answer("جاري تجهيز ملف التصدير…")
    async with _export_lock:
        try:
            await page_registry.export_snapshot()
            await usage_stats.flush()
            exported = await asyncio.to_thread(build_data_export)
            if exported is None:
                await callback.message.answer("لا توجد بيانات لتصديرها.")
                return
            await callback.message.answer_document(
                BufferedInputFile(exported.content, filename=exported.filename),
                caption=(
                    "✅ تم تصدير بيانات البوت بنجاح.\n"
                    f"عدد الملفات: {exported.file_count}\n"
                    f"الحجم قبل الضغط: {exported.source_size:,} بايت\n\n"
                    "تقدر تستورد هذا الملف لاحقًا من زر «📤 رفع واستيراد». "
                    "احتفظ به في مكان آمن."
                ),
            )
        except (DataImportError, OSError, TelegramAPIError):
            logger.exception("Could not create or send developer data export")
            await callback.message.answer(
                "تعذر تصدير البيانات. تأكد من سلامة ملفات JSON وراجع سجل البوت."
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
            await state_database.sync_local_paths(list(prepared))
            if any(path.endswith("rich_pages.json") for path in prepared):
                await page_registry.replace_from_local_backup()
            await showcase_media_library.reload()
            await showcase_channel_store.reload()
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
        await _send_developer_panel(
            callback.message,
            "✅ تم استيراد البيانات بنجاح.\n"
            f"عدد الملفات المستبدلة: {len(imported)}",
        )


@router.callback_query(F.data == "dev:import:cancel")
async def cancel_data_import(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    await state.clear()
    if isinstance(callback.message, Message):
        await _send_developer_panel(callback.message, "تم إلغاء الاستيراد.")
    await callback.answer()


def _format_stats_time(value: int | None) -> str:
    if not value:
        return "—"
    return datetime.fromtimestamp(value, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _format_bytes(value: int | None) -> str:
    if value is None:
        return "—"
    size = float(max(0, value))
    units = ("B", "KB", "MB", "GB", "TB")
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{int(value)} B"


def _format_duration(seconds: int) -> str:
    total = max(0, int(seconds))
    days, remainder = divmod(total, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, _ = divmod(remainder, 60)
    if days:
        return f"{days}d {hours}h {minutes}m"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _user_label(user: dict[str, object]) -> str:
    username = user.get("username")
    if isinstance(username, str) and username:
        return f"@{username}"
    name = " ".join(
        part
        for part in (
            str(user.get("first_name") or "").strip(),
            str(user.get("last_name") or "").strip(),
        )
        if part
    )
    return name or str(user.get("user_id") or "—")


@router.callback_query(F.data == "dev:stats")
async def show_usage_statistics(callback: CallbackQuery) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    if not isinstance(callback.message, Message):
        await callback.answer()
        return

    now = int(datetime.now(tz=timezone.utc).timestamp())
    snapshot = await usage_stats.snapshot(now=now)
    operational = await usage_stats.operational_snapshot(now=now)
    page_stats = await page_registry.statistics()
    runtime = await state_database.runtime_statistics(now - (2 * 60 * 60))
    database_status = state_database.status()

    tracked_users = int(snapshot.get("tracked_users") or 0)
    events = int(snapshot.get("events") or 0)
    languages = snapshot.get("languages")
    language_text = "—"
    if isinstance(languages, dict) and languages:
        language_text = "، ".join(
            f"{code}: {count}"
            for code, count in sorted(
                languages.items(),
                key=lambda item: int(item[1]),
                reverse=True,
            )[:5]
        )

    oldest_candidates = [
        value
        for value in (
            snapshot.get("oldest_seen"),
            page_stats.get("oldest_page"),
        )
        if isinstance(value, int) and value > 0
    ]
    oldest = min(oldest_candidates) if oldest_candidates else None
    operations = operational.get("operations")
    operations = operations if isinstance(operations, dict) else {}

    await callback.answer()
    await _send_developer_panel(
        callback.message,
        "📊 بيانات / إحصائيات\n\n"
        "👥 المستخدمون\n"
        f"الإجمالي المعروف: {tracked_users:,}\n"
        f"لديهم بيانات حساب: {int(snapshot.get('profiled_users') or 0):,}\n"
        f"لديهم username: {int(snapshot.get('users_with_username') or 0):,}\n"
        f"نشطون آخر ساعة: {int(snapshot.get('active_1h') or 0):,}\n"
        f"نشطون آخر 24 ساعة: {int(snapshot.get('active_24h') or 0):,}\n"
        f"نشطون آخر 7 أيام: {int(snapshot.get('active_7d') or 0):,}\n"
        f"نشطون آخر 30 يوم: {int(snapshot.get('active_30d') or 0):,}\n"
        f"جدد آخر 24 ساعة: {int(snapshot.get('new_24h') or 0):,}\n"
        f"جدد آخر 7 أيام: {int(snapshot.get('new_7d') or 0):,}\n"
        f"أكثر اللغات: {language_text}\n"
        f"إجمالي التفاعلات: {events:,}\n\n"
        "⚙️ التشغيل والأداء\n"
        f"Uptime: {_format_duration(int(operational.get('uptime_seconds') or 0))}\n"
        f"Requests هذه الدقيقة: {int(operational.get('requests_current_minute') or 0):,}\n"
        f"متوسط requests/min آخر 5 دقائق: {float(operational.get('requests_per_minute_5m') or 0):.2f}\n"
        f"متوسط الاستجابة آخر 5 دقائق: {float(operational.get('avg_response_ms_5m') or 0):.1f}ms\n"
        f"أعلى استجابة مسجلة: {float(operational.get('max_response_ms') or 0):.1f}ms\n"
        f"أخطاء handlers آخر ساعة: {int(operational.get('failures_last_hour') or 0):,}\n"
        f"Preview: ✅ {int(operations.get('preview_success') or 0):,} | ❌ {int(operations.get('preview_failed') or 0):,}\n"
        f"Publish: ✅ {int(operations.get('publish_success') or 0):,} | ❌ {int(operations.get('publish_failed') or 0):,}\n"
        f"Rate-limit events: {int(operations.get('rate_limited') or 0):,}\n\n"
        "🗄 قاعدة البيانات\n"
        f"الحالة: {'PostgreSQL' if database_status.connected else 'JSON fallback'}\n"
        f"DB latency: {database_status.latency_ms or 0}ms\n"
        f"حجم قاعدة البيانات: {_format_bytes(runtime.get('database_bytes'))}\n"
        f"حجم جدول الصفحات: {_format_bytes(runtime.get('pages_table_bytes'))}\n"
        f"FSM sessions: {int(runtime.get('fsm_sessions') or 0):,}\n"
        f"المحررات النشطة: {int(runtime.get('active_editors') or 0):,}\n"
        f"الصفحات المحفوظة: {int(page_stats.get('pages') or 0):,}\n"
        f"مستخدمون لديهم صفحات: {int(page_stats.get('page_owners') or 0):,}\n\n"
        f"الفترة المتاحة: {_format_stats_time(oldest)} → الآن",
        extra_buttons=[
            {
                "text": "👥 إحصائيات المستخدمين",
                "callback_data": "dev:stats:users:0",
                "style": "primary",
            },
            {
                "text": "🔄 تحديث",
                "callback_data": "dev:stats",
                "style": "primary",
            },
        ],
    )


@router.callback_query(F.data.startswith("dev:stats:users:"))
async def show_user_statistics(callback: CallbackQuery) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    if not isinstance(callback.message, Message):
        await callback.answer()
        return
    try:
        requested_page = max(0, int(callback.data.rsplit(":", 1)[-1]))
    except (AttributeError, TypeError, ValueError):
        requested_page = 0

    page = requested_page
    users, total = await usage_stats.users_page(page, page_size=10, sort_mode="recent")
    max_page = max(0, (total - 1) // 10)
    page = min(page, max_page)
    if page != requested_page:
        users, total = await usage_stats.users_page(page, page_size=10, sort_mode="recent")

    page_counts = await asyncio.gather(
        *(page_registry.count_for_user(int(user["user_id"])) for user in users)
    )
    lines = [
        "👥 إحصائيات المستخدمين",
        f"المستخدمون: {total:,}",
        f"الصفحة: {page + 1}/{max_page + 1}",
        "",
    ]
    for index, (user, page_count) in enumerate(zip(users, page_counts), start=page * 10 + 1):
        language = str(user.get("language_code") or "—")
        lines.extend([
            f"{index}) {_user_label(user)}",
            f"ID: {int(user['user_id'])}",
            f"التفاعلات: {int(user.get('events') or 0):,} | الصفحات: {page_count}",
            f"اللغة: {language}",
            f"أول ظهور: {_format_stats_time(int(user.get('first_seen') or 0))}",
            f"آخر ظهور: {_format_stats_time(int(user.get('last_seen') or 0))}",
            "",
        ])
    if not users:
        lines.append("لا توجد بيانات مستخدمين بعد.")

    buttons: list[dict[str, str]] = []
    if page > 0:
        buttons.append({
            "text": "⬅️ السابق",
            "callback_data": f"dev:stats:users:{page - 1}",
            "style": "primary",
        })
    buttons.append({
        "text": "📊 الملخص",
        "callback_data": "dev:stats",
        "style": "primary",
    })
    if page < max_page:
        buttons.append({
            "text": "التالي ➡️",
            "callback_data": f"dev:stats:users:{page + 1}",
            "style": "primary",
        })

    await callback.answer()
    await _send_developer_panel(
        callback.message,
        "\n".join(lines),
        extra_buttons=buttons,
    )


@router.callback_query(F.data == "dev:database:check")
async def check_database_connection(callback: CallbackQuery) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return
    await callback.answer("جاري فحص قاعدة البيانات…")
    status = await state_database.check_and_reconnect(force=True)
    if not isinstance(callback.message, Message):
        return
    if status.connected:
        await _send_developer_panel(
            callback.message,
            "✅ قاعدة البيانات متصلة.\n\n"
            f"الوضع الحالي: PostgreSQL\n"
            f"زمن الاستجابة: {status.latency_ms or 1}ms\n"
            f"المخازن المتزامنة: {status.synced_namespaces}\n"
            f"عمليات JSON المنتظرة: {status.pending_sync}",
        )
        return
    if not status.configured:
        detail = "متغير DATABASE_URL غير مضاف إلى خدمة البوت في Railway."
    else:
        detail = status.last_error or "فشل الاتصال لسبب غير معروف."
    await _send_developer_panel(
        callback.message,
        "⚠️ قاعدة البيانات غير متصلة.\n\n"
        f"{detail}\n\n"
        "البوت مستمر بالعمل تلقائيًا باستخدام ملفات JSON الاحتياطية.",
    )


@router.callback_query(F.data == "dev:showcase:refresh")
async def refresh_showcase_channel(callback: CallbackQuery, bot: Bot) -> None:
    if not _is_developer(callback.from_user.id):
        await callback.answer("هذا الخيار للمطوّر فقط.", show_alert=True)
        return

    await callback.answer("جاري تحديث قناة المعاينة…")
    try:
        result = await showcase_channel_store.refresh(bot, callback.from_user.id)
    except TelegramAPIError:
        logger.exception("Could not refresh showcase channel cache")
        if isinstance(callback.message, Message):
            await _send_developer_panel(
                callback.message,
                "❌ تعذر تحديث قناة المعاينة. تأكد أن البوت ما زال مشرفًا في القناة.",
            )
        return

    if not isinstance(callback.message, Message):
        return

    text = (
        "✅ تم تحديث قناة المعاينة.\n\n"
        f"العناصر المحفوظة قبل الفحص: {result.total}\n"
        f"المحتوى الحالي: {result.retained}\n"
        f"المحذوف من الكاش: {result.removed}"
    )
    if result.failed_checks:
        text += f"\nتعذر التحقق مؤقتًا من: {result.failed_checks}"
    if result.total == 0:
        text += "\n\nلا يوجد محتوى محفوظ بعد؛ أي منشور جديد في قناة المعاينة سيُحفظ تلقائيًا."
    await _send_developer_panel(callback.message, text)

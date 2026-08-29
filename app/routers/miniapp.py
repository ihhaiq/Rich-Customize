from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command, StateFilter
from aiogram.types import (
    InlineKeyboardButton, InlineKeyboardMarkup, Message, ReplyKeyboardRemove, WebAppInfo,
)

from app.config import developer_ids
from app.miniapp import mini_app_url
from app.miniapp_rich_buttons import complete_user_picker

router = Router(name="miniapp_beta")


def _resume_url(page_id: str) -> str | None:
    base = mini_app_url()
    if not base:
        return None
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}page={page_id}"


@router.message(Command("app"), F.chat.type == "private")
async def open_mini_app(message: Message) -> None:
    if message.from_user is None or message.from_user.id not in developer_ids():
        return
    url = mini_app_url()
    if not url:
        await message.answer(
            "Mini App Beta 0.3 جاهزة، لكن ماكو رابط عام بعد. "
            "حدد MINI_APP_URL أو RAILWAY_PUBLIC_DOMAIN ثم أعد التشغيل."
        )
        return
    await message.answer(
        "🧪 Rich Customize Mini App — Beta 0.3\n\n"
        "واجهة بأسلوب محرر Telegram، تعديل مباشر للـBlocks، Undo/Redo، "
        "وقائمة / لإضافة أي Block متوفر. النسخة ما زالت خاصة بالمطور فقط.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="🌐 فتح Mini App Beta 0.3",
                web_app=WebAppInfo(url=url),
            )
        ]]),
    )


@router.message(StateFilter(None), F.chat.type == "private", F.users_shared)
async def receive_miniapp_rich_button_user(message: Message) -> None:
    if message.from_user is None or message.from_user.id not in developer_ids():
        return
    shared = message.users_shared
    if shared is None or not shared.users:
        return
    selected_user = shared.users[0]
    username = getattr(selected_user, "username", None)
    if not username:
        try:
            known_user = await message.bot.get_chat(selected_user.user_id)
            username = getattr(known_user, "username", None)
        except Exception:
            username = None

    result = await complete_user_picker(
        message.from_user.id,
        shared.request_id,
        selected_user.user_id,
        username,
    )
    if result is None:
        return

    await message.answer(
        f"✅ تم ربط زر «{result['button_title']}» بالمستخدم "
        f"{result.get('target_label') or selected_user.user_id}.",
        reply_markup=ReplyKeyboardRemove(),
    )

    resume_url = _resume_url(str(result["page_id"]))
    if resume_url:
        await message.answer(
            "↩️ كمل التحرير من نفس المكان:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text="↩️ متابعة التحرير",
                    web_app=WebAppInfo(url=resume_url),
                )
            ]]),
        )

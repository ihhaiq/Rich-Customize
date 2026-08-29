from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from app.config import developer_ids
from app.miniapp import mini_app_url

router = Router(name="miniapp_beta")


@router.message(Command("app"), F.chat.type == "private")
async def open_mini_app(message: Message) -> None:
    if message.from_user is None or message.from_user.id not in developer_ids():
        return
    url = mini_app_url()
    if not url:
        await message.answer(
            "Mini App Beta 0.2 جاهزة، لكن ماكو رابط عام بعد. "
            "حدد MINI_APP_URL أو RAILWAY_PUBLIC_DOMAIN ثم أعد التشغيل."
        )
        return
    await message.answer(
        "🧪 Rich Customize Mini App — Beta 0.2\n\n"
        "واجهة جديدة بأسلوب محرر Telegram، تعديل مباشر للـBlocks، Undo/Redo، "
        "وقائمة / لإضافة أي Block متوفر. النسخة ما زالت خاصة بالمطور فقط.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="🌐 فتح Mini App Beta 0.2",
                web_app=WebAppInfo(url=url),
            )
        ]]),
    )

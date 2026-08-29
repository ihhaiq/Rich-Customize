from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from app.config import developer_ids
from app.miniapp import mini_app_url

router = Router(name="miniapp_beta")


@router.message(Command("app"))
async def open_mini_app(message: Message) -> None:
    if message.from_user is None or message.from_user.id not in developer_ids():
        return
    url = mini_app_url()
    if not url:
        await message.answer(
            "Mini App Beta 0.1 جاهزة، لكن ماكو رابط عام بعد. "
            "حدد MINI_APP_URL أو RAILWAY_PUBLIC_DOMAIN ثم أعد التشغيل."
        )
        return
    await message.answer(
        "🧪 Rich Customize Mini App — Beta 0.1\n\n"
        "نسخة تجريبية خاصة بالمطور. تقدر تفتح الصفحات المحفوظة، "
        "تعدل النصوص وترتيب الـBlocks وتحفظ بنفس كود CBD.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="🌐 فتح Mini App Beta",
                web_app=WebAppInfo(url=url),
            )
        ]]),
    )

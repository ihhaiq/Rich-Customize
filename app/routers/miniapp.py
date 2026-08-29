from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command, StateFilter
from aiogram.types import (
    InlineKeyboardButton, InlineKeyboardMarkup, Message, ReplyKeyboardRemove,
)

from app.config import developer_ids
from app.miniapp import mini_app_url
from app.miniapp_links import direct_mini_app_link, mini_app_short_name
from app.miniapp_rich_buttons import complete_user_picker

router = Router(name="miniapp_beta")


def _resume_link(bot_username: str, page_id: str) -> str:
    return direct_mini_app_link(bot_username, f"page_{page_id}")


@router.message(Command("app"), F.chat.type == "private")
async def open_mini_app(message: Message) -> None:
    # /app remains an internal developer shortcut. Public users enter through
    # the Direct/Named Mini App link: t.me/RichCustomizebot/<short_name>
    if message.from_user is None or message.from_user.id not in developer_ids():
        return
    if not mini_app_url():
        await message.answer(
            "Mini App Beta 0.3 جاهزة، لكن ماكو رابط عام بعد. "
            "حدد MINI_APP_URL أو RAILWAY_PUBLIC_DOMAIN ثم أعد التشغيل."
        )
        return

    me = await message.bot.get_me()
    if not me.username:
        await message.answer("تعذر تحديد يوزر البوت لفتح التطبيق المصغر.")
        return

    named_link = direct_mini_app_link(me.username)
    await message.answer(
        "🧪 Rich Customize Mini App — Beta 0.3\n\n"
        "اختصار خاص بالمطور لفتح نفس مسار الـNamed Mini App العام.\n"
        f"Short name: {mini_app_short_name()}",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="🌐 فتح Mini App Beta 0.3",
                url=named_link,
            )
        ]]),
    )


@router.message(StateFilter(None), F.chat.type == "private", F.users_shared)
async def receive_miniapp_rich_button_user(message: Message) -> None:
    # This flow belongs to the public Mini App. The pending request registry
    # already verifies that request_id belongs to message.from_user.id.
    if message.from_user is None:
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

    me = await message.bot.get_me()
    if me.username:
        await message.answer(
            "↩️ كمل التحرير من نفس المكان:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text="↩️ متابعة التحرير",
                    url=_resume_link(me.username, str(result["page_id"])),
                )
            ]]),
        )

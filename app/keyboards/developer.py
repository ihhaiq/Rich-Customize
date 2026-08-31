from aiogram.enums import ButtonStyle
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def build_developer_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📤 رفع واستيراد",
            callback_data="dev:import",
            style=ButtonStyle.SUCCESS,
        ),
        InlineKeyboardButton(
            text="📥 تنزيل وتصدير",
            callback_data="dev:export",
            style=ButtonStyle.PRIMARY,
        ),
    ]])


def build_developer_import_confirmation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="✅ تأكيد الاستيراد",
            callback_data="dev:import:confirm",
            style=ButtonStyle.DANGER,
        ),
        InlineKeyboardButton(text="❌ إلغاء", callback_data="dev:import:cancel"),
    ]])


__all__ = ["build_developer_import_confirmation_keyboard", "build_developer_keyboard"]

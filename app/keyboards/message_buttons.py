from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import (
    CopyTextButton,
    DisabledButton,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    LoginUrl,
    WebAppInfo,
)

from app.services.buttons import (
    get_button_type,
    get_button_value,
    get_message_button,
    normalize_button_positions,
)


def resolve_button_style(value: str | None) -> ButtonStyle | None:
    return {
        "primary": ButtonStyle.PRIMARY,
        "success": ButtonStyle.SUCCESS,
        "danger": ButtonStyle.DANGER,
    }.get(value or "default")


def build_message_buttons_keyboard(
    buttons: list[dict[str, Any]], *, buttons_per_row: int = 1,
    include_back: bool = False,
    back_text: str = "🔙 رجوع",
) -> InlineKeyboardMarkup:
    rendered: list[InlineKeyboardButton] = []
    for button in normalize_button_positions(buttons):
        common = {
            "text": str(button.get("text") or "زر"),
            "style": resolve_button_style(str(button.get("style", "default"))),
        }
        button_type = get_button_type(button)
        value = get_button_value(button)
        if button_type == "copy":
            rendered.append(InlineKeyboardButton(**common, copy_text=CopyTextButton(text=value)))
        elif button_type == "callback_data":
            rendered.append(InlineKeyboardButton(**common, callback_data=value))
        elif button_type == "popup":
            rendered.append(InlineKeyboardButton(
                **common,
                callback_data=f"r:popup:{button.get('popup_token') or button['id']}",
            ))
        elif button_type == "web_app":
            rendered.append(InlineKeyboardButton(**common, web_app=WebAppInfo(url=value)))
        elif button_type == "login_url":
            rendered.append(InlineKeyboardButton(**common, login_url=LoginUrl(url=value)))
        elif button_type == "switch_inline":
            rendered.append(InlineKeyboardButton(**common, switch_inline_query=value))
        elif button_type == "switch_inline_current":
            rendered.append(InlineKeyboardButton(**common, switch_inline_query_current_chat=value))
        elif button_type == "disabled":
            rendered.append(InlineKeyboardButton(**common, disabled=DisabledButton()))
        elif button_type == "page":
            rendered.append(InlineKeyboardButton(**common, callback_data=f"r:page:{value}"))
        else:
            rendered.append(InlineKeyboardButton(**common, url=value or "https://t.me"))
    width = max(1, min(8, int(buttons_per_row)))
    rows = [rendered[index:index + width] for index in range(0, len(rendered), width)]
    if include_back:
        rows.append([InlineKeyboardButton(text=back_text, callback_data="r:bpback")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_button_type_keyboard(callback_prefix: str = "r:bat") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔗 رابط أو @username", callback_data=f"{callback_prefix}:url")],
        [InlineKeyboardButton(text="⚡ Callback Data", callback_data=f"{callback_prefix}:callback_data")],
        [InlineKeyboardButton(text="📋 نسخ نص", callback_data=f"{callback_prefix}:copy")],
        [InlineKeyboardButton(text="💬 Popup تنبيه", callback_data=f"{callback_prefix}:popup")],
        [
            InlineKeyboardButton(text="🌐 Web App", callback_data=f"{callback_prefix}:web_app"),
            InlineKeyboardButton(text="🔐 Login URL", callback_data=f"{callback_prefix}:login_url"),
        ],
        [
            InlineKeyboardButton(text="🔎 Inline بمحادثة", callback_data=f"{callback_prefix}:switch_inline"),
            InlineKeyboardButton(text="💬 Inline هنا", callback_data=f"{callback_prefix}:switch_inline_current"),
        ],
        [InlineKeyboardButton(text="🚫 زر معطّل", callback_data=f"{callback_prefix}:disabled")],
        [InlineKeyboardButton(text="⚡ CBD — فتح صفحة", callback_data=f"{callback_prefix}:page")],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:buttons")],
    ])


def build_page_target_keyboard(
    pages: list[dict[str, Any]], action: str, button_id: str | None = None,
) -> InlineKeyboardMarkup:
    prefix = f"r:bpg:{action}" + (f":{button_id}" if button_id else "")
    rows = [[InlineKeyboardButton(
        text=f"📄 {page.get('title') or page['page_id']}",
        callback_data=f"{prefix}:{page['page_id']}",
    )] for page in pages]
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:buttons")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_buttons_manager_keyboard(
    buttons: list[dict[str, Any]], buttons_per_row: int = 1,
) -> InlineKeyboardMarkup:
    count = len(buttons)
    rows = [
        [
            InlineKeyboardButton(text="➕ إضافة", callback_data="r:ba", style=ButtonStyle.PRIMARY),
            InlineKeyboardButton(text="➖ إزالة", callback_data="r:bs:delete", style=ButtonStyle.DANGER),
        ],
        [
            InlineKeyboardButton(text="🎨 تغيير اللون", callback_data="r:bs:style"),
            InlineKeyboardButton(text="↕️ تغيير الترتيب", callback_data="r:bs:move"),
        ],
        [
            InlineKeyboardButton(text="🧩 تغيير المحتوى", callback_data="r:bs:value"),
            InlineKeyboardButton(text="✏️ تغيير العنوان", callback_data="r:bs:title"),
        ],
        [InlineKeyboardButton(text=f"🔢 عدد الأزرار بالصف: {buttons_per_row}", callback_data="r:brow")],
        [InlineKeyboardButton(
            text=f"👁 معاينة الأزرار ({count})", callback_data="r:bpreview",
            style=ButtonStyle.PRIMARY,
        )],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_button_picker_keyboard(
    buttons: list[dict[str, Any]], action: str,
) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(
            text=f"{index + 1}. {button.get('text') or 'زر'}",
            callback_data=f"r:bt:{action}:{button['id']}",
        )]
        for index, button in enumerate(normalize_button_positions(buttons))
    ]
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:buttons")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_button_style_keyboard(
    button_id: str, current_style: str, *, allow_link: bool = False,
) -> InlineKeyboardMarkup:
    choices = [
        ("⚪ شفاف", "default", None),
        ("🔵 أزرق", "primary", ButtonStyle.PRIMARY),
        ("🟢 أخضر", "success", ButtonStyle.SUCCESS),
        ("🔴 أحمر", "danger", ButtonStyle.DANGER),
    ]
    if allow_link:
        choices.append(("🔗 رابط بلا إطار", "link", None))
    rows = [[InlineKeyboardButton(
        text=f"{'✅ ' if current_style == value else ''}{text}",
        callback_data=f"r:bsc:{button_id}:{value}",
        style=style,
    )] for text, value, style in choices]
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:buttons")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_button_position_keyboard(
    buttons: list[dict[str, Any]], button_id: str,
) -> InlineKeyboardMarkup:
    current = get_message_button(buttons, button_id)
    rows = []
    for index, button in enumerate(normalize_button_positions(buttons)):
        selected = button is current
        rows.append([InlineKeyboardButton(
            text=f"{'✅ ' if selected else ''}{index + 1} — {button.get('text') or 'زر'}",
            callback_data="r:no" if selected else f"r:bmv:{button_id}:{index}",
        )])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:buttons")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


__all__ = [
    "build_button_picker_keyboard",
    "build_button_position_keyboard",
    "build_button_style_keyboard",
    "build_button_type_keyboard",
    "build_buttons_manager_keyboard",
    "build_message_buttons_keyboard",
    "build_page_target_keyboard",
    "resolve_button_style",
]

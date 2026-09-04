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

from app.i18n import t
from app.services.buttons import (
    get_button_type,
    get_button_value,
    get_message_button,
    normalize_button_positions,
)


BUTTON_TYPE_KEYS = {
    "url": "ux.buttons.type.url",
    "callback_data": "ux.buttons.type.callback",
    "copy": "ux.buttons.type.copy",
    "popup": "ux.buttons.type.popup",
    "web_app": "ux.buttons.type.web_app",
    "login_url": "ux.buttons.type.login_url",
    "switch_inline": "ux.buttons.type.inline",
    "switch_inline_current": "ux.buttons.type.inline_here",
    "disabled": "ux.buttons.type.disabled",
    "page": "ux.buttons.type.page",
}


def button_type_label(button: dict[str, Any]) -> str:
    return t(BUTTON_TYPE_KEYS.get(get_button_type(button), "ux.buttons.type.url"))


def button_style_label(button: dict[str, Any]) -> str:
    style = str(button.get("style", "default"))
    key = (
        f"ux.buttons.style.{style}"
        if style in {"default", "primary", "success", "danger", "link"}
        else "ux.buttons.style.default"
    )
    return t(key)


def resolve_button_style(value: str | None) -> ButtonStyle | None:
    return {
        "primary": ButtonStyle.PRIMARY,
        "success": ButtonStyle.SUCCESS,
        "danger": ButtonStyle.DANGER,
    }.get(value or "default")


def build_message_buttons_keyboard(
    buttons: list[dict[str, Any]], *, buttons_per_row: int = 1,
    include_back: bool = False,
    back_text: str | None = None,
) -> InlineKeyboardMarkup:
    rendered: list[InlineKeyboardButton] = []
    for button in normalize_button_positions(buttons):
        common = {
            "text": str(button.get("text") or "Button"),
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
        rows.append([InlineKeyboardButton(
            text=back_text or t("ux.common.back"), callback_data="r:bpback",
        )])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_button_type_keyboard(callback_prefix: str = "r:bat") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t("ux.buttons.category.links"), disabled=DisabledButton())],
        [InlineKeyboardButton(text=t("ux.buttons.type.url"), callback_data=f"{callback_prefix}:url")],
        [
            InlineKeyboardButton(text=t("ux.buttons.type.web_app"), callback_data=f"{callback_prefix}:web_app"),
            InlineKeyboardButton(text=t("ux.buttons.type.login_url"), callback_data=f"{callback_prefix}:login_url"),
        ],
        [InlineKeyboardButton(text=t("ux.buttons.category.actions"), disabled=DisabledButton())],
        [
            InlineKeyboardButton(text=t("ux.buttons.type.callback"), callback_data=f"{callback_prefix}:callback_data"),
            InlineKeyboardButton(text=t("ux.buttons.type.copy"), callback_data=f"{callback_prefix}:copy"),
        ],
        [InlineKeyboardButton(text=t("ux.buttons.type.popup"), callback_data=f"{callback_prefix}:popup")],
        [InlineKeyboardButton(text=t("ux.buttons.category.navigation"), disabled=DisabledButton())],
        [InlineKeyboardButton(text=t("ux.buttons.type.page"), callback_data=f"{callback_prefix}:page")],
        [InlineKeyboardButton(text=t("ux.buttons.category.search"), disabled=DisabledButton())],
        [
            InlineKeyboardButton(text=t("ux.buttons.type.inline"), callback_data=f"{callback_prefix}:switch_inline"),
            InlineKeyboardButton(text=t("ux.buttons.type.inline_here"), callback_data=f"{callback_prefix}:switch_inline_current"),
        ],
        [InlineKeyboardButton(text=t("ux.buttons.category.special"), disabled=DisabledButton())],
        [InlineKeyboardButton(text=t("ux.buttons.type.disabled"), callback_data=f"{callback_prefix}:disabled")],
        [InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:buttons")],
    ])


def build_page_target_keyboard(
    pages: list[dict[str, Any]], action: str, button_id: str | None = None,
) -> InlineKeyboardMarkup:
    prefix = f"r:bpg:{action}" + (f":{button_id}" if button_id else "")
    rows = [[InlineKeyboardButton(
        text=f"📄 {page.get('title') or page['page_id']}",
        callback_data=f"{prefix}:{page['page_id']}",
    )] for page in pages]
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:buttons")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_buttons_manager_keyboard(
    buttons: list[dict[str, Any]], buttons_per_row: int = 1,
) -> InlineKeyboardMarkup:
    ordered = normalize_button_positions(buttons)
    rows = [[InlineKeyboardButton(
        text=t(
            "ux.buttons.summary",
            position=index + 1,
            title=str(button.get("text") or "Button")[:24],
            type=button_type_label(button),
            style=button_style_label(button),
        ),
        callback_data=f"r:bed:{button['id']}",
    )] for index, button in enumerate(ordered)]
    rows.extend([
        [InlineKeyboardButton(
            text=t("ux.buttons.add"), callback_data="r:ba", style=ButtonStyle.PRIMARY,
        )],
        [InlineKeyboardButton(
            text=t("ux.buttons.layout", count=buttons_per_row), callback_data="r:brow",
        )],
        [InlineKeyboardButton(
            text=f"{t('button_preview')} ({len(ordered)})", callback_data="r:bpreview",
            style=ButtonStyle.PRIMARY,
        )],
        [InlineKeyboardButton(text=t("ux.buttons.undo"), callback_data="r:undo")],
        [InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:back")],
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_button_editor_keyboard(button: dict[str, Any]) -> InlineKeyboardMarkup:
    button_id = str(button["id"])
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=t("ux.buttons.edit_title"), callback_data=f"r:bedit:title:{button_id}"),
            InlineKeyboardButton(text=t("ux.buttons.edit_value"), callback_data=f"r:bedit:value:{button_id}"),
        ],
        [
            InlineKeyboardButton(text=t("ux.buttons.edit_type"), callback_data=f"r:bedit:type:{button_id}"),
            InlineKeyboardButton(text=t("color"), callback_data=f"r:bedit:style:{button_id}"),
        ],
        [InlineKeyboardButton(text=t("reorder"), callback_data=f"r:bedit:move:{button_id}")],
        [InlineKeyboardButton(
            text=t("ux.buttons.delete"), callback_data=f"r:bdel:{button_id}",
            style=ButtonStyle.DANGER,
        )],
        [InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:buttons")],
    ])


def build_button_delete_confirmation_keyboard(button_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("ux.common.yes_delete"), callback_data=f"r:bdelok:{button_id}",
            style=ButtonStyle.DANGER,
        ),
        InlineKeyboardButton(text=t("ux.common.cancel"), callback_data=f"r:bed:{button_id}"),
    ]])


def build_button_picker_keyboard(
    buttons: list[dict[str, Any]], action: str,
) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(
            text=f"{index + 1}. {button.get('text') or 'Button'}",
            callback_data=f"r:bt:{action}:{button['id']}",
        )]
        for index, button in enumerate(normalize_button_positions(buttons))
    ]
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:buttons")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_button_style_keyboard(
    button_id: str, current_style: str, *, allow_link: bool = False,
) -> InlineKeyboardMarkup:
    choices = [
        (f"⚪ {t('ux.buttons.style.default')}", "default", None),
        (f"🔵 {t('ux.buttons.style.primary')}", "primary", ButtonStyle.PRIMARY),
        (f"🟢 {t('ux.buttons.style.success')}", "success", ButtonStyle.SUCCESS),
        (f"🔴 {t('ux.buttons.style.danger')}", "danger", ButtonStyle.DANGER),
    ]
    if allow_link:
        choices.append((f"🔗 {t('ux.buttons.style.link')}", "link", None))
    rows = [[InlineKeyboardButton(
        text=f"{'✅ ' if current_style == value else ''}{text}",
        callback_data=f"r:bsc:{button_id}:{value}",
        style=style,
    )] for text, value, style in choices]
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:buttons")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_button_position_keyboard(
    buttons: list[dict[str, Any]], button_id: str,
) -> InlineKeyboardMarkup:
    current = get_message_button(buttons, button_id)
    rows = []
    for index, button in enumerate(normalize_button_positions(buttons)):
        selected = button is current
        rows.append([InlineKeyboardButton(
            text=f"{'✅ ' if selected else ''}{index + 1} — {button.get('text') or 'Button'}",
            callback_data=None if selected else f"r:bmv:{button_id}:{index}",
            disabled=DisabledButton() if selected else None,
        )])
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:buttons")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


__all__ = [
    "build_button_picker_keyboard",
    "build_button_editor_keyboard",
    "build_button_delete_confirmation_keyboard",
    "build_button_position_keyboard",
    "build_button_style_keyboard",
    "build_button_type_keyboard",
    "build_buttons_manager_keyboard",
    "build_message_buttons_keyboard",
    "build_page_target_keyboard",
    "resolve_button_style",
]

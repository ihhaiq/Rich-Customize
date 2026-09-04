from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import DisabledButton, InlineKeyboardButton, InlineKeyboardMarkup

from app.i18n import t, tr
from app.services.blocks import BLOCK_LABELS
from app.editor.specs import MEDIA_CAPTION_TYPES, QUOTE_TYPES, compatible_child_block_types


def build_details_inner_blocks_keyboard(details: dict[str, Any]) -> InlineKeyboardMarkup:
    details_id = str(details["id"])
    children = sorted(
        details.get("data", {}).get("children", []),
        key=lambda item: int(item.get("position", 0)),
    )
    rows = [[InlineKeyboardButton(
        text=f"{index}. {BLOCK_LABELS.get(str(child.get('type', '')), t('block.content'))}",
        callback_data=f"r:di:{details_id}:{child['id']}",
    )] for index, child in enumerate(children, start=1)]
    rows.append([InlineKeyboardButton(text=t("common.cancel"), callback_data=f"r:b:{details_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_details_inner_block_keyboard(
    details: dict[str, Any], child: dict[str, Any],
) -> InlineKeyboardMarkup:
    details_id = str(details["id"])
    child_id = str(child["id"])
    children = sorted(
        details.get("data", {}).get("children", []),
        key=lambda item: int(item.get("position", 0)),
    )
    position = children.index(child)
    prefix = f"{details_id}:{child_id}"
    rows: list[list[InlineKeyboardButton]] = [[InlineKeyboardButton(
        text=t("preview_block"), callback_data=f"r:dip:{prefix}", style=ButtonStyle.PRIMARY,
    )]]
    if child.get("type") != "divider":
        rows.append([InlineKeyboardButton(text=t("edit_content"), callback_data=f"r:die:{prefix}")])
    if child.get("type") in MEDIA_CAPTION_TYPES:
        rows.append([
            InlineKeyboardButton(text=t("block.caption"), callback_data=f"r:dif:{prefix}:caption"),
            InlineKeyboardButton(text=t("details.inner_credit"), callback_data=f"r:dif:{prefix}:credit"),
        ])
    elif child.get("type") in QUOTE_TYPES:
        rows.append([InlineKeyboardButton(
            text=t("details.inner_credit"), callback_data=f"r:dif:{prefix}:credit",
        )])
    elif child.get("type") not in {"footer", "divider", "anchor"}:
        rows.append([InlineKeyboardButton(
            text=t("details.inner_add_footer"), callback_data=f"r:dif:{prefix}:add_footer",
        )])
    rows.extend([
        [InlineKeyboardButton(
            text=t("delete"), callback_data=f"r:did:{prefix}", style=ButtonStyle.DANGER,
        )],
        [
            InlineKeyboardButton(
                text=t("block.move_up"),
                callback_data=None if position <= 0 else f"r:dimu:{prefix}",
                disabled=DisabledButton() if position <= 0 else None,
            ),
            InlineKeyboardButton(
                text=t("block.move_down"),
                callback_data=None if position >= len(children) - 1 else f"r:dimd:{prefix}",
                disabled=(
                    DisabledButton() if position >= len(children) - 1 else None
                ),
            ),
        ],
        [InlineKeyboardButton(text=t("back"), callback_data=f"r:dim:{details_id}")],
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_details_inner_delete_keyboard(details_id: str, child_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("pages.delete_yes"),
            callback_data=f"r:didok:{details_id}:{child_id}",
            style=ButtonStyle.DANGER,
        ),
        InlineKeyboardButton(text=t("common.cancel"), callback_data=f"r:di:{details_id}:{child_id}"),
    ]])


def build_details_content_keyboard(child_count: int = 0) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(
        text=tr("➕ بلوك داخلي"), callback_data="r:details:add", style=ButtonStyle.PRIMARY,
    )]]
    if child_count:
        rows.append([InlineKeyboardButton(
            text=tr(f"✅ إنهاء التفاصيل ({child_count})"),
            callback_data="r:details:finish", style=ButtonStyle.SUCCESS,
        )])
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:details:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_inner_block_keyboard(container_type: str) -> InlineKeyboardMarkup:
    choices = [
        (BLOCK_LABELS[kind], kind)
        for kind in compatible_child_block_types(container_type)
        if kind in BLOCK_LABELS
    ]
    rows = [
        [InlineKeyboardButton(
            text=text, callback_data=f"r:details:type:{kind}",
        ) for text, kind in choices[index:index + 2]]
        for index in range(0, len(choices), 2)
    ]
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:details:content")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_inner_block_input_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=tr("🔙 أنواع البلوكات الداخلية"), callback_data="r:details:add"),
    ]])


__all__ = [
    "build_details_content_keyboard",
    "build_details_inner_block_keyboard",
    "build_details_inner_blocks_keyboard",
    "build_details_inner_delete_keyboard",
    "build_inner_block_input_keyboard",
    "build_inner_block_keyboard",
]

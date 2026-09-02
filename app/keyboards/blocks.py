from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import DisabledButton, InlineKeyboardButton, InlineKeyboardMarkup

from app.i18n import t
from app.services.anchors import anchor_target_id, anchor_targets
from app.services.blocks import get_block_button_text, table_flag, table_rows
from app.services.factory import MEDIA_CAPTION_TYPES, QUOTE_TYPES


def build_block_editor_keyboard(
    block: dict[str, Any], blocks: list[dict[str, Any]],
) -> InlineKeyboardMarkup:
    block_id = block["id"]
    linked_anchor = block["type"] == "anchor" and bool(anchor_target_id(block))
    ordered = sorted(blocks, key=lambda item: item["position"])
    position = ordered.index(block)
    rows: list[list[InlineKeyboardButton]] = [[InlineKeyboardButton(
        text="👁 معاينة هذا الـBlock", callback_data=f"r:pv:{block_id}",
        style=ButtonStyle.PRIMARY,
    )]]
    if block["type"] != "divider":
        label = "✏️ تعديل المحتوى" if block["type"] == "details" else "✏️ تعديل"
        rows.append([InlineKeyboardButton(text=label, callback_data=f"r:e:{block_id}")])
    if block["type"] == "anchor":
        rows.append([InlineKeyboardButton(
            text=t("anchor.change_target"), callback_data=f"r:am:{block_id}",
        )])
    if block["type"] == "details":
        rows.append([InlineKeyboardButton(
            text="📝 تعديل عنوان التفاصيل", callback_data=f"r:f:{block_id}:summary",
        )])
        rows.append([InlineKeyboardButton(
            text=t("details.inner_manage_button"),
            callback_data=f"r:dim:{block_id}", style=ButtonStyle.PRIMARY,
        )])
    if block["type"] == "table":
        rows.append([InlineKeyboardButton(
            text="🎛 إعدادات خلايا الجدول", callback_data=f"r:tm:{block_id}",
        )])
    if block["type"] == "list" and block.get("data", {}).get("kind") == "checklist":
        for item_index, item in enumerate(block.get("data", {}).get("items", [])):
            if not isinstance(item, dict):
                continue
            checked = bool(item.get("is_checked"))
            task_text = str(item.get("text") or t("list.unnamed_task"))
            if len(task_text) > 48:
                task_text = f"{task_text[:47]}…"
            rows.append([InlineKeyboardButton(
                text=f"{'☑️' if checked else '☐'} {task_text}",
                callback_data=f"r:ct:{block_id}:{item_index}",
                style=ButtonStyle.SUCCESS if checked else None,
            )])
    if block["type"] in MEDIA_CAPTION_TYPES:
        rows.append([
            InlineKeyboardButton(text="💬 تعديل التذييل", callback_data=f"r:f:{block_id}:caption"),
            InlineKeyboardButton(text="✍️ تعديل المصدر", callback_data=f"r:f:{block_id}:credit"),
        ])
    if block["type"] in QUOTE_TYPES:
        rows.append([InlineKeyboardButton(
            text="✍️ تعديل الكاتب", callback_data=f"r:f:{block_id}:credit",
        )])
    rows.append([InlineKeyboardButton(
        text="🗑 حذف", callback_data=f"r:d:{block_id}", style=ButtonStyle.DANGER,
    )])
    if not linked_anchor:
        rows.append([
            InlineKeyboardButton(
                text=t("block.move_up"),
                callback_data=None if position <= 0 else f"r:mu:{block_id}",
                disabled=DisabledButton() if position <= 0 else None,
            ),
            InlineKeyboardButton(
                text=t("block.move_down"),
                callback_data=None if position >= len(ordered) - 1 else f"r:md:{block_id}",
                disabled=DisabledButton() if position >= len(ordered) - 1 else None,
            ),
        ])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_table_options_keyboard(block_id: str) -> InlineKeyboardMarkup:
    choices = [
        ("🟨 تظليل خلية", "sh"), ("⬜ إلغاء تظليل خلية", "uh"),
        ("↔️ توسيط خلية", "ce"), ("↩️ إلغاء توسيط خلية", "ue"),
        ("🟨 تظليل الجميع", "sha"), ("⬜ إلغاء تظليل الجميع", "uha"),
        ("↔️ توسيط الجميع", "cea"), ("↩️ إلغاء توسيط الجميع", "uea"),
    ]
    rows = [
        [InlineKeyboardButton(text=text, callback_data=f"r:ta:{block_id}:{action}") for text, action in choices[index:index + 2]]
        for index in range(0, len(choices), 2)
    ]
    rows.append([InlineKeyboardButton(
        text="🧱 إعدادات مظهر الجدول",
        callback_data=f"r:tdisplay:{block_id}",
        style=ButtonStyle.PRIMARY,
    )])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:b:{block_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_table_display_keyboard(block: dict[str, Any]) -> InlineKeyboardMarkup:
    block_id = str(block["id"])
    data = block.get("data", {})
    native = data.get("native_data") if isinstance(data.get("native_data"), dict) else {}
    has_caption = bool(
        data.get("caption_rich_text")
        or data.get("caption_html")
        or data.get("caption_text")
        or native.get("caption")
    )
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=f"{'✅' if table_flag(block, 'is_bordered') else '❌'} الحدود",
            callback_data=f"r:ttoggle:{block_id}:is_bordered",
        )],
        [InlineKeyboardButton(
            text=f"{'✅' if table_flag(block, 'is_striped') else '❌'} صفوف مخططة",
            callback_data=f"r:ttoggle:{block_id}:is_striped",
        )],
        [InlineKeyboardButton(
            text=f"{'✅' if table_flag(block, 'is_compact') else '❌'} وضع مضغوط",
            callback_data=f"r:ttoggle:{block_id}:is_compact",
        )],
        [InlineKeyboardButton(
            text=f"✏️ {'تعديل عنوان الجدول' if has_caption else 'إضافة عنوان للجدول'}",
            callback_data=f"r:tcaption:{block_id}",
        )],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:tm:{block_id}")],
    ])


def build_table_cell_keyboard(block: dict[str, Any], action: str) -> InlineKeyboardMarkup:
    block_id = block["id"]
    buttons = []
    for row_index, row in enumerate(table_rows(block)):
        for column_index, raw_cell in enumerate(row):
            cell = raw_cell if isinstance(raw_cell, dict) else {}
            try:
                colspan = max(1, int(cell.get("colspan") or 1))
            except (TypeError, ValueError):
                colspan = 1
            span = f" ↔{colspan}" if colspan > 1 else ""
            buttons.append(InlineKeyboardButton(
                text=f"{row_index + 1}×{column_index + 1}{span}",
                callback_data=f"r:tc:{block_id}:{action}:{row_index}:{column_index}",
            ))
    rows = [buttons[index:index + 4] for index in range(0, len(buttons), 4)]
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:tm:{block_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_add_block_keyboard() -> InlineKeyboardMarkup:
    choices = [
        (t("block.paragraph"), "paragraph"), (t("block.heading"), "heading"),
        (t("block.preformatted"), "preformatted"), (t("block.footer"), "footer"),
        (t("block.divider"), "divider"), (t("block.mathematical_expression"), "mathematical_expression"),
        (t("block.anchor"), "anchor"), (t("list.menu_button"), "listmenu"),
        (t("block.blockquote"), "blockquote"), (t("block.pullquote"), "pullquote"),
        (t("block.collage"), "collage"), (t("block.slideshow"), "slideshow"),
        (t("block.table"), "table"), (t("block.details"), "details"),
        (t("block.map"), "map"), (t("block.animation"), "animation"),
        (t("block.audio"), "audio"), (t("block.photo"), "photo"),
        (t("block.document"), "document"), (t("block.video"), "video"),
        (t("block.voice"), "voice"),
    ]
    rows = [
        [InlineKeyboardButton(text=text, callback_data=f"r:add:{kind}") for text, kind in choices[index:index + 2]]
        for index in range(0, len(choices), 2)
    ]
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_list_type_keyboard(
    *, callback_prefix: str = "r:addlist", back_data: str = "r:addmenu",
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t("list.bullet"), callback_data=f"{callback_prefix}:bullet")],
        [InlineKeyboardButton(text=t("list.numbered"), callback_data=f"{callback_prefix}:numbered")],
        [InlineKeyboardButton(text=t("list.checklist"), callback_data=f"{callback_prefix}:checklist")],
        [InlineKeyboardButton(text=t("common.cancel"), callback_data=back_data)],
    ])


def build_heading_level_keyboard(action: str, block_id: str | None = None) -> InlineKeyboardMarkup:
    suffix = f":{block_id}" if block_id else ""
    labels = (
        "H1 — الأكبر", "H2 — كبير", "H3 — متوسط كبير",
        "H4 — متوسط", "H5 — صغير", "H6 — الأصغر",
    )
    rows = [
        [
            InlineKeyboardButton(
                text=labels[index - 1],
                callback_data=f"r:hs:{action}:{index}{suffix}",
            )
            for index in range(start, min(start + 2, 7))
        ]
        for start in range(1, 7, 2)
    ]
    if action == "add":
        back_data = "r:addmenu"
    elif action == "details":
        back_data = "r:details:add"
    else:
        back_data = f"r:b:{block_id}"
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=back_data)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_delete_confirmation_keyboard(block_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🗑 نعم، حذف", callback_data=f"r:dc:{block_id}", style=ButtonStyle.DANGER,
        ),
        InlineKeyboardButton(text="إلغاء", callback_data=f"r:b:{block_id}"),
    ]])


def build_anchor_target_keyboard(
    blocks: list[dict[str, Any]],
    *,
    callback_prefix: str = "r:at",
    exclude_ids: set[str] | None = None,
    back_data: str = "r:addmenu",
) -> InlineKeyboardMarkup:
    excluded = exclude_ids or set()
    ordered = sorted(blocks, key=lambda item: int(item.get("position", 0)))
    candidates = anchor_targets(ordered, exclude_ids=excluded)
    rows = [[InlineKeyboardButton(
        text=get_block_button_text(block, ordered.index(block)),
        callback_data=f"{callback_prefix}:{block['id']}",
    )] for block in candidates]
    rows.append([InlineKeyboardButton(text=t("common.cancel"), callback_data=back_data)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_linked_anchor_delete_keyboard(
    block_id: str,
    blocks: list[dict[str, Any]],
) -> InlineKeyboardMarkup:
    ordered = sorted(blocks, key=lambda item: int(item.get("position", 0)))
    candidates = anchor_targets(ordered, exclude_ids={block_id})
    rows = [[InlineKeyboardButton(
        text=t(
            "anchor.move_before_target",
            target=get_block_button_text(target, ordered.index(target)),
        ),
        callback_data=f"r:adr:{block_id}:{target['id']}",
    )] for target in candidates]
    rows.append([InlineKeyboardButton(
        text=t("anchor.delete_with_target"),
        callback_data=f"r:adc:{block_id}",
        style=ButtonStyle.DANGER,
    )])
    rows.append([InlineKeyboardButton(
        text=t("common.cancel"), callback_data=f"r:b:{block_id}",
    )])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_block_position_keyboard(blocks: list[dict[str, Any]], block_id: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for index, block in enumerate(sorted(blocks, key=lambda item: item["position"])):
        current = block["id"] == block_id
        rows.append([InlineKeyboardButton(
            text=f"{'✅ ' if current else ''}{index + 1}",
            callback_data=None if current else f"r:mt:{block_id}:{index}",
            disabled=DisabledButton() if current else None,
        )])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:b:{block_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


__all__ = [
    "build_add_block_keyboard",
    "build_anchor_target_keyboard",
    "build_block_editor_keyboard",
    "build_block_position_keyboard",
    "build_delete_confirmation_keyboard",
    "build_heading_level_keyboard",
    "build_list_type_keyboard",
    "build_linked_anchor_delete_keyboard",
    "build_table_cell_keyboard",
    "build_table_display_keyboard",
    "build_table_options_keyboard",
]

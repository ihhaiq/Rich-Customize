from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup

from app.services.blocks import get_block_button_text, table_rows
from app.services.buttons import (
    get_button_type, get_button_value, get_message_button, normalize_button_positions,
)
from app.services.factory import MEDIA_CAPTION_TYPES, QUOTE_TYPES


def build_welcome_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🧩 قالب كل البلوكات", callback_data="r:showcase"),
    ]])


def _style(value: str | None) -> ButtonStyle | None:
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
            "style": _style(str(button.get("style", "default"))),
        }
        button_type = get_button_type(button)
        value = get_button_value(button)
        if button_type == "copy":
            rendered.append(InlineKeyboardButton(
                **common, copy_text=CopyTextButton(text=value),
            ))
        elif button_type == "popup":
            rendered.append(InlineKeyboardButton(
                **common,
                callback_data=f"r:popup:{button.get('popup_token') or button['id']}",
            ))
        else:
            rendered.append(InlineKeyboardButton(
                **common, url=value or "https://t.me",
            ))
    width = max(1, min(4, int(buttons_per_row)))
    rows = [rendered[index:index + width] for index in range(0, len(rendered), width)]
    if include_back:
        rows.append([InlineKeyboardButton(text=back_text, callback_data="r:bpback")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_rich_editor_keyboard(
    blocks: list[dict[str, Any]], buttons: list[dict[str, Any]] | None = None,
) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=get_block_button_text(block, index), callback_data=f"r:b:{block['id']}")]
        for index, block in enumerate(sorted(blocks, key=lambda item: item["position"]))
    ]
    rows.append([
        InlineKeyboardButton(text="➕ إضافة Block", callback_data="r:addmenu"),
        InlineKeyboardButton(text="🔘 إضافة أزرار", callback_data="r:buttons"),
    ])
    rows.append([
        InlineKeyboardButton(
            text="📝 إنشاء منشور", callback_data="r:post", style=ButtonStyle.PRIMARY,
        ),
        InlineKeyboardButton(
            text="✅ النتيجة", callback_data="r:result", style=ButtonStyle.SUCCESS,
        ),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_post_chats_keyboard(
    chats: list[dict[str, Any]],
    channel_url: str,
    group_url: str,
    selected_chat_ids: list[int] | None = None,
) -> InlineKeyboardMarkup:
    selected = set(selected_chat_ids or [])
    rows: list[list[InlineKeyboardButton]] = []
    for chat in chats:
        chat_id = int(chat["chat_id"])
        icon = "📢" if chat.get("type") == "channel" else "👥"
        rows.append([InlineKeyboardButton(
            text=f"{'✅' if chat_id in selected else '⬜'} {icon} {chat.get('title') or chat_id}",
            callback_data=f"r:postchat:{chat_id}",
        )])
    if chats:
        rows.append([InlineKeyboardButton(
            text=f"⚙️ إعدادات وإرسال ({len(selected)})",
            callback_data="r:postsettings",
            style=ButtonStyle.SUCCESS,
        )])
    rows.extend([
        [InlineKeyboardButton(
            text="➕ إضافة البوت إلى قناة", url=channel_url,
            style=ButtonStyle.PRIMARY,
        )],
        [InlineKeyboardButton(
            text="➕ إضافة البوت إلى مجموعة", url=group_url,
            style=ButtonStyle.PRIMARY,
        )],
    ])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_chat_reached_keyboard(chat_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📝 إرسال المنشور", callback_data=f"r:postchat:{chat_id}",
            style=ButtonStyle.SUCCESS,
        ),
    ]])


def build_post_settings_keyboard(
    *, silent: bool, protected: bool, selected_count: int = 1,
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🔕 منشور صامت", callback_data="r:pt:silent"),
            InlineKeyboardButton(text="✅" if silent else "❌", callback_data="r:pt:silent"),
        ],
        [
            InlineKeyboardButton(text="🛡 منشور محمي", callback_data="r:pt:protected"),
            InlineKeyboardButton(text="✅" if protected else "❌", callback_data="r:pt:protected"),
        ],
        [InlineKeyboardButton(
            text=f"📤 إرسال إلى {selected_count} محادثة", callback_data="r:postsend",
            style=ButtonStyle.SUCCESS,
        )],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:postlist")],
    ])


def build_button_type_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔗 رابط أو @username", callback_data="r:bat:url")],
        [InlineKeyboardButton(text="📋 نسخ نص", callback_data="r:bat:copy")],
        [InlineKeyboardButton(text="💬 Popup تنبيه", callback_data="r:bat:popup")],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:buttons")],
    ])


def build_buttons_manager_keyboard(
    buttons: list[dict[str, Any]], buttons_per_row: int = 1,
) -> InlineKeyboardMarkup:
    count = len(buttons)
    rows = [
        [
            InlineKeyboardButton(text="➕ إضافة", callback_data="r:ba"),
            InlineKeyboardButton(text="➖ إزالة", callback_data="r:bs:delete"),
        ],
        [
            InlineKeyboardButton(text="🎨 تغيير اللون", callback_data="r:bs:style"),
            InlineKeyboardButton(text="↕️ تغيير الترتيب", callback_data="r:bs:move"),
        ],
        [
            InlineKeyboardButton(text="🧩 تغيير المحتوى", callback_data="r:bs:value"),
            InlineKeyboardButton(text="✏️ تغيير العنوان", callback_data="r:bs:title"),
        ],
        [InlineKeyboardButton(
            text=f"🔢 عدد الأزرار بالصف: {buttons_per_row}", callback_data="r:brow",
        )],
        [InlineKeyboardButton(
            text=f"👁 معاينة الأزرار ({count})", callback_data="r:bpreview",
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


def build_button_style_keyboard(button_id: str, current_style: str) -> InlineKeyboardMarkup:
    choices = [
        ("⚪ شفاف", "default", None),
        ("🔵 أزرق", "primary", ButtonStyle.PRIMARY),
        ("🟢 أخضر", "success", ButtonStyle.SUCCESS),
        ("🔴 أحمر", "danger", ButtonStyle.DANGER),
    ]
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


def build_result_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="✅ النتيجة", callback_data="r:result", style=ButtonStyle.SUCCESS,
        ),
    ]])


def build_block_editor_keyboard(block: dict[str, Any]) -> InlineKeyboardMarkup:
    block_id = block["id"]
    rows: list[list[InlineKeyboardButton]] = []
    if block["type"] != "divider":
        label = "✏️ تعديل المحتوى" if block["type"] == "details" else "✏️ تعديل"
        rows.append([InlineKeyboardButton(text=label, callback_data=f"r:e:{block_id}")])
    if block["type"] == "details":
        rows.append([InlineKeyboardButton(text="📝 تعديل عنوان التفاصيل", callback_data=f"r:f:{block_id}:summary")])
    if block["type"] == "table":
        rows.append([InlineKeyboardButton(text="🎛 إعدادات خلايا الجدول", callback_data=f"r:tm:{block_id}")])
    if block["type"] in MEDIA_CAPTION_TYPES:
        rows.append([
            InlineKeyboardButton(text="💬 تعديل التذييل", callback_data=f"r:f:{block_id}:caption"),
            InlineKeyboardButton(text="✍️ تعديل المصدر", callback_data=f"r:f:{block_id}:credit"),
        ])
    if block["type"] in QUOTE_TYPES:
        rows.append([InlineKeyboardButton(text="✍️ تعديل الكاتب", callback_data=f"r:f:{block_id}:credit")])
    rows.extend([
        [InlineKeyboardButton(text="🗑 حذف", callback_data=f"r:d:{block_id}", style=ButtonStyle.DANGER)],
        [InlineKeyboardButton(text="↕️ تغيير الموقع", callback_data=f"r:m:{block_id}")],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")],
    ])
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
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:b:{block_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_table_cell_keyboard(block: dict[str, Any], action: str) -> InlineKeyboardMarkup:
    block_id = block["id"]
    buttons = [
        InlineKeyboardButton(
            text=f"{row_index + 1}×{column_index + 1}",
            callback_data=f"r:tc:{block_id}:{action}:{row_index}:{column_index}",
        )
        for row_index, row in enumerate(table_rows(block))
        for column_index in range(len(row))
    ]
    rows = [buttons[index:index + 4] for index in range(0, len(buttons), 4)]
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:tm:{block_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_add_block_keyboard() -> InlineKeyboardMarkup:
    choices = [
        ("📝 Paragraph", "paragraph"), ("🔠 Section Heading", "heading"),
        ("💻 Preformatted", "preformatted"), ("🔻 Footer", "footer"),
        ("➖ Divider", "divider"), ("∑ Math", "mathematical_expression"),
        ("⚓ Anchor", "anchor"), ("📋 List", "list"),
        ("❝ Blockquote", "blockquote"), ("💬 Pullquote", "pullquote"),
        ("🖼 Collage", "collage"), ("🎞 Slideshow", "slideshow"),
        ("▦ Table", "table"), ("📂 Details", "details"),
        ("🗺 Map", "map"), ("🎞 Animation", "animation"),
        ("🎵 Audio", "audio"), ("🖼 Photo", "photo"),
        ("🎬 Video", "video"), ("🎙 Voice Note", "voice"),
    ]
    rows = [
        [InlineKeyboardButton(text=text, callback_data=f"r:add:{kind}") for text, kind in choices[index:index + 2]]
        for index in range(0, len(choices), 2)
    ]
    rows.append([InlineKeyboardButton(text="💭 Thinking (للمسودة فقط)", callback_data="r:add:thinking")])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_heading_level_keyboard(
    action: str,
    block_id: str | None = None,
) -> InlineKeyboardMarkup:
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
    back_data = "r:addmenu" if action == "add" else f"r:b:{block_id}"
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=back_data)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_delete_confirmation_keyboard(block_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🗑 نعم، حذف", callback_data=f"r:dc:{block_id}", style=ButtonStyle.DANGER),
        InlineKeyboardButton(text="إلغاء", callback_data=f"r:b:{block_id}"),
    ]])


def build_block_position_keyboard(blocks: list[dict[str, Any]], block_id: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for index, block in enumerate(sorted(blocks, key=lambda item: item["position"])):
        current = block["id"] == block_id
        rows.append([InlineKeyboardButton(
            text=f"{'✅ ' if current else ''}{index + 1}",
            callback_data=f"r:no" if current else f"r:mt:{block_id}:{index}",
        )])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:b:{block_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)

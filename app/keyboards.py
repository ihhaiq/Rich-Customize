from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import (
    CopyTextButton, DisabledButton, InlineKeyboardButton, InlineKeyboardMarkup,
    LoginUrl, WebAppInfo,
)

from app.services.blocks import BLOCK_LABELS, get_block_button_text, table_rows
from app.services.buttons import (
    get_button_type, get_button_value, get_message_button, normalize_button_positions,
)
from app.services.factory import (
    MEDIA_CAPTION_TYPES, QUOTE_TYPES, compatible_child_block_types,
)
from app.i18n import t


def build_welcome_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🧩 قالب كل البلوكات", callback_data="r:showcase"),
        InlineKeyboardButton(
            text=t("editor.new_button"), callback_data="r:starteditor",
            style=ButtonStyle.PRIMARY,
        ),
    ]])


def build_start_editor_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("editor.start_button"),
            callback_data="r:starteditor",
            style=ButtonStyle.PRIMARY,
        ),
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
        elif button_type == "callback_data":
            rendered.append(InlineKeyboardButton(
                **common, callback_data=value,
            ))
        elif button_type == "popup":
            rendered.append(InlineKeyboardButton(
                **common,
                callback_data=f"r:popup:{button.get('popup_token') or button['id']}",
            ))
        elif button_type == "web_app":
            rendered.append(InlineKeyboardButton(
                **common, web_app=WebAppInfo(url=value),
            ))
        elif button_type == "login_url":
            rendered.append(InlineKeyboardButton(
                **common, login_url=LoginUrl(url=value),
            ))
        elif button_type == "switch_inline":
            rendered.append(InlineKeyboardButton(
                **common, switch_inline_query=value,
            ))
        elif button_type == "switch_inline_current":
            rendered.append(InlineKeyboardButton(
                **common, switch_inline_query_current_chat=value,
            ))
        elif button_type == "disabled":
            rendered.append(InlineKeyboardButton(
                **common, disabled=DisabledButton(),
            ))
        elif button_type == "page":
            rendered.append(InlineKeyboardButton(
                **common, callback_data=f"r:page:{value}",
            ))
        else:
            rendered.append(InlineKeyboardButton(
                **common, url=value or "https://t.me",
            ))
    width = max(1, min(8, int(buttons_per_row)))
    rows = [rendered[index:index + width] for index in range(0, len(rendered), width)]
    if include_back:
        rows.append([InlineKeyboardButton(text=back_text, callback_data="r:bpback")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_rich_editor_keyboard(
    blocks: list[dict[str, Any]], buttons: list[dict[str, Any]] | None = None,
) -> InlineKeyboardMarkup:
    if not blocks:
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="📚 صفحاتي", callback_data="r:pages",
            ),
            InlineKeyboardButton(
                text="➕ إضافة Block", callback_data="r:addmenu", style=ButtonStyle.PRIMARY,
            ),
        ]])
    rows = [
        [InlineKeyboardButton(text=get_block_button_text(block, index), callback_data=f"r:b:{block['id']}")]
        for index, block in enumerate(sorted(blocks, key=lambda item: item["position"]))
    ]
    rows.append([
        InlineKeyboardButton(text=t("editor.tools_button"), callback_data="r:tools"),
        InlineKeyboardButton(
            text="➕ إضافة Block", callback_data="r:addmenu", style=ButtonStyle.PRIMARY,
        ),
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


def build_editor_tools_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🔘 إضافة أزرار", callback_data="r:buttons"),
            InlineKeyboardButton(
                text="💾 حفظ الصفحة", callback_data="r:savepage",
                style=ButtonStyle.SUCCESS,
            ),
        ],
        [
            InlineKeyboardButton(text="📚 صفحاتي", callback_data="r:pages"),
            InlineKeyboardButton(text=t("editor.undo_button"), callback_data="r:undo"),
        ],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")],
    ])


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


def build_pages_keyboard(
    pages: list[dict[str, Any]],
    page_index: int = 0,
    total_pages: int = 1,
    *,
    show_controls: bool = False,
    pagination_prefix: str = "r:pages",
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for page in pages:
        page_id = str(page["page_id"])
        title = str(page.get("title") or page_id)[:24]
        rows.append([InlineKeyboardButton(
            text=f"📄 {title}",
            callback_data=f"r:pageopen:{page_id}",
            style=ButtonStyle.PRIMARY,
        )])
        rows.append([
            InlineKeyboardButton(
                text=f"📋 {page_id}",
                copy_text=CopyTextButton(text=page_id),
            ),
            InlineKeyboardButton(
                text="✏️", callback_data=f"r:prename:{page_id}:{page_index}",
            ),
            InlineKeyboardButton(
                text="🗑", callback_data=f"r:pdelete:{page_id}:{page_index}",
                style=ButtonStyle.DANGER,
            ),
        ])
    if total_pages > 1:
        rows.append([
            InlineKeyboardButton(
                text="◀️",
                callback_data="r:no" if page_index <= 0 else f"{pagination_prefix}:{page_index - 1}",
            ),
            InlineKeyboardButton(text=f"{page_index + 1}/{total_pages}", callback_data="r:no"),
            InlineKeyboardButton(
                text="▶️",
                callback_data="r:no" if page_index >= total_pages - 1 else f"{pagination_prefix}:{page_index + 1}",
            ),
        ])
    if show_controls:
        rows.append([
            InlineKeyboardButton(text=t("pages.search_button"), callback_data="r:psearch"),
            InlineKeyboardButton(text=t("pages.sort_button"), callback_data="r:psort"),
        ])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_page_sort_keyboard(current_sort: str) -> InlineKeyboardMarkup:
    choices = [
        (t("pages.sort_updated"), "updated"),
        (t("pages.sort_newest"), "newest"),
        (t("pages.sort_oldest"), "oldest"),
        (t("pages.sort_title"), "title"),
    ]
    rows = [[InlineKeyboardButton(
        text=f"{'✅ ' if current_sort == value else ''}{label}",
        callback_data=f"r:psortset:{value}",
        style=ButtonStyle.PRIMARY if current_sort == value else None,
    )] for label, value in choices]
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:pages:0")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_page_delete_confirmation_keyboard(page_id: str, page_index: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("pages.delete_yes"), callback_data=f"r:pdeleteok:{page_id}:{page_index}",
            style=ButtonStyle.DANGER,
        ),
        InlineKeyboardButton(text=t("common.cancel"), callback_data=f"r:pages:{page_index}"),
    ]])


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
            InlineKeyboardButton(
                text="➕ إضافة", callback_data="r:ba", style=ButtonStyle.PRIMARY,
            ),
            InlineKeyboardButton(
                text="➖ إزالة", callback_data="r:bs:delete", style=ButtonStyle.DANGER,
            ),
        ],
        [
            InlineKeyboardButton(text="🎨 تغيير اللون", callback_data="r:bs:style"),
            InlineKeyboardButton(text="↕️ تغيير الترتيب", callback_data="r:bs:move"),
        ],
        [
            InlineKeyboardButton(text="🧩 تغيير المحتوى", callback_data="r:bs:value"),
            InlineKeyboardButton(text="✏️ تغيير العنوان", callback_data="r:bs:title"),
        ],
        [InlineKeyboardButton(text="🔄 تغيير نوع الزر", callback_data="r:bs:type")],
        [InlineKeyboardButton(
            text=f"🔢 عدد الأزرار بالصف: {buttons_per_row}", callback_data="r:brow",
        )],
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


def build_result_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="✅ النتيجة", callback_data="r:result", style=ButtonStyle.SUCCESS,
        ),
    ]])


def build_block_editor_keyboard(
    block: dict[str, Any], blocks: list[dict[str, Any]],
) -> InlineKeyboardMarkup:
    block_id = block["id"]
    ordered = sorted(blocks, key=lambda item: item["position"])
    position = ordered.index(block)
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(
            text="👁 معاينة هذا الـBlock", callback_data=f"r:pv:{block_id}",
            style=ButtonStyle.PRIMARY,
        )],
    ]
    if block["type"] != "divider":
        label = "✏️ تعديل المحتوى" if block["type"] == "details" else "✏️ تعديل"
        rows.append([InlineKeyboardButton(text=label, callback_data=f"r:e:{block_id}")])
    if block["type"] == "details":
        rows.append([InlineKeyboardButton(text="📝 تعديل عنوان التفاصيل", callback_data=f"r:f:{block_id}:summary")])
        rows.append([InlineKeyboardButton(
            text=t("details.inner_manage_button"),
            callback_data=f"r:dim:{block_id}",
            style=ButtonStyle.PRIMARY,
        )])
    if block["type"] == "table":
        rows.append([InlineKeyboardButton(text="🎛 إعدادات خلايا الجدول", callback_data=f"r:tm:{block_id}")])
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
        rows.append([InlineKeyboardButton(text="✍️ تعديل الكاتب", callback_data=f"r:f:{block_id}:credit")])
    rows.extend([
        [InlineKeyboardButton(text="🗑 حذف", callback_data=f"r:d:{block_id}", style=ButtonStyle.DANGER)],
        [
            InlineKeyboardButton(
                text=t("block.move_up"),
                callback_data="r:no" if position <= 0 else f"r:mu:{block_id}",
            ),
            InlineKeyboardButton(
                text=t("block.move_down"),
                callback_data="r:no" if position >= len(ordered) - 1 else f"r:md:{block_id}",
            ),
        ],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")],
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


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
    rows.append([InlineKeyboardButton(
        text=t("common.cancel"), callback_data=f"r:b:{details_id}",
    )])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_details_inner_block_keyboard(
    details: dict[str, Any],
    child: dict[str, Any],
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
        text=t("preview_block"), callback_data=f"r:dip:{prefix}",
        style=ButtonStyle.PRIMARY,
    )]]
    if child.get("type") != "divider":
        rows.append([InlineKeyboardButton(
            text=t("edit_content"), callback_data=f"r:die:{prefix}",
        )])
    if child.get("type") in MEDIA_CAPTION_TYPES:
        rows.append([
            InlineKeyboardButton(
                text=t("block.caption"), callback_data=f"r:dif:{prefix}:caption",
            ),
            InlineKeyboardButton(
                text=t("details.inner_credit"), callback_data=f"r:dif:{prefix}:credit",
            ),
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
            text=t("delete"), callback_data=f"r:did:{prefix}",
            style=ButtonStyle.DANGER,
        )],
        [
            InlineKeyboardButton(
                text=t("block.move_up"),
                callback_data="r:no" if position <= 0 else f"r:dimu:{prefix}",
            ),
            InlineKeyboardButton(
                text=t("block.move_down"),
                callback_data="r:no" if position >= len(children) - 1 else f"r:dimd:{prefix}",
            ),
        ],
        [InlineKeyboardButton(
            text=t("back"), callback_data=f"r:dim:{details_id}",
        )],
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_details_inner_delete_keyboard(
    details_id: str, child_id: str,
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("pages.delete_yes"),
            callback_data=f"r:didok:{details_id}:{child_id}",
            style=ButtonStyle.DANGER,
        ),
        InlineKeyboardButton(
            text=t("common.cancel"), callback_data=f"r:di:{details_id}:{child_id}",
        ),
    ]])


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
        ("📝 Paragraph", "paragraph"), ("🔠 Section Heading", "heading"),
        ("💻 Preformatted", "preformatted"), ("🔻 Footer", "footer"),
        ("➖ Divider", "divider"), ("∑ Math", "mathematical_expression"),
        ("⚓ Anchor", "anchor"), (t("list.menu_button"), "listmenu"),
        ("❝ Blockquote", "blockquote"), ("💬 Pullquote", "pullquote"),
        ("🖼 Collage", "collage"), ("🎞 Slideshow", "slideshow"),
        ("▦ Table", "table"), ("📂 Details", "details"),
        ("🗺 Map", "map"), ("🎞 Animation", "animation"),
        ("🎵 Audio", "audio"), ("🖼 Photo", "photo"),
        ("📄 Document", "document"), ("🎬 Video", "video"),
        ("🎙 Voice Note", "voice"),
    ]
    rows = [
        [InlineKeyboardButton(text=text, callback_data=f"r:add:{kind}") for text, kind in choices[index:index + 2]]
        for index in range(0, len(choices), 2)
    ]
    rows.append([InlineKeyboardButton(text="💭 Thinking (للمسودة فقط)", callback_data="r:add:thinking")])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_list_type_keyboard(
    *,
    callback_prefix: str = "r:addlist",
    back_data: str = "r:addmenu",
) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t("list.bullet"), callback_data=f"{callback_prefix}:bullet",
        )],
        [InlineKeyboardButton(
            text=t("list.numbered"), callback_data=f"{callback_prefix}:numbered",
        )],
        [InlineKeyboardButton(
            text=t("list.checklist"), callback_data=f"{callback_prefix}:checklist",
        )],
        [InlineKeyboardButton(text=t("common.cancel"), callback_data=back_data)],
    ])


def build_details_content_keyboard(child_count: int = 0) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(
        text="➕ بلوك داخلي", callback_data="r:details:add",
        style=ButtonStyle.PRIMARY,
    )]]
    if child_count:
        rows.append([InlineKeyboardButton(
            text=f"✅ إنهاء التفاصيل ({child_count})",
            callback_data="r:details:finish",
            style=ButtonStyle.SUCCESS,
        )])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:details:cancel")])
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
    rows.append([InlineKeyboardButton(
        text="🔙 رجوع", callback_data="r:details:content",
    )])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_inner_block_input_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🔙 أنواع البلوكات الداخلية", callback_data="r:details:add",
        ),
    ]])


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

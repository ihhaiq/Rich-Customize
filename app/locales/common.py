from __future__ import annotations

from typing import Any

PHRASES: dict[str, str] = {
    "customize": "Customize message",
    "choose_block": "Choose the block you want to edit:",
    "block_added": "Block added successfully.",
    "welcome": "Welcome to the Rich Message Editor.",
    "start_editor": "Send /editor to start a new message.",
    "send_message": "Send the message you want to customize.",
    "unsupported": "This type is not supported. Send text, media, or a Rich Message.",
    "expired": "The session has expired. Send /editor to start again.",
    "add_block": "➕ Add Block",
    "result": "✅ Result",
    "create_post": "📝 Create Post",
    "save_page": "💾 Save Page",
    "pages": "📚 My Pages",
    "edit": "✏️ Edit",
    "edit_content": "✏️ Edit content",
    "delete": "🗑 Delete",
    "move": "↕️ Change position",
    "back": "🔙 Back",
    "preview_block": "👁 Preview this Block",
    "preview_generating": "Generating preview…",
    "preview_ready": "Preview is ready.",
    "preview_failed": "Preview failed.",
    "add_buttons": "🔘 Add Buttons",
    "buttons_manage": "Manage rich-message buttons",
    "add": "➕ Add",
    "remove": "➖ Remove",
    "color": "🎨 Change color",
    "reorder": "↕️ Reorder",
    "change_content": "🧩 Change action content",
    "change_title": "✏️ Change title",
    "button_preview": "👁 Preview buttons",
    "post_settings": "Post settings",
    "send_now": "📤 Send post now",
    "select_chat": "Select at least one chat.",
    "details": "Details",
    "photo": "Photo",
    "video": "Video",
    "audio": "Audio",
    "voice": "Voice note",
    "document": "Document",
    "table": "Table",
    "list": "List",
    "paragraph": "Paragraph",
    "heading": "Section heading",
    "footer": "Footer",
    "divider": "Divider",
    "map": "Map",
    "invalid": "Invalid selection.",
    "missing_block": "This block no longer exists.",
    "choose_action": "Choose an action:",
    "send_file": "Send a document.",
    "send_photo": "Send a photo.",
    "send_video": "Send a video.",
    "send_audio": "Send an audio file.",
    "send_voice": "Send a voice note.",
}


def pack(**values: str) -> dict[str, str]:
    return {
        PHRASES[key]: value
        for key, value in values.items()
        if key in PHRASES and value
    }


def profile(
    name: str,
    description: str,
    short: str,
    editor: str,
    draft: str,
    start: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "short": short,
        "commands": {
            "editor": editor,
            "draft": draft,
            "start": start,
        },
    }

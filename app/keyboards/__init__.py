"""Public entry point for feature-scoped keyboard builders."""

# ruff: noqa: F401 - imports in this module intentionally form the public facade.

from app.keyboards.blocks import (
    build_add_block_keyboard,
    build_anchor_target_keyboard,
    build_block_editor_keyboard,
    build_block_position_keyboard,
    build_delete_confirmation_keyboard,
    build_heading_level_keyboard,
    build_list_type_keyboard,
    build_linked_anchor_delete_keyboard,
    build_table_cell_keyboard,
    build_table_display_keyboard,
    build_table_options_keyboard,
)
from app.keyboards.details import (
    build_details_content_keyboard,
    build_details_inner_block_keyboard,
    build_details_inner_blocks_keyboard,
    build_details_inner_delete_keyboard,
    build_inner_block_input_keyboard,
    build_inner_block_keyboard,
)
from app.keyboards.developer import (
    build_developer_import_confirmation_keyboard,
    build_developer_keyboard,
)
from app.keyboards.editor import (
    build_error_recovery_keyboard,
    build_editor_tools_keyboard,
    build_result_keyboard,
    build_rich_editor_keyboard,
    build_start_editor_keyboard,
    build_welcome_keyboard,
)
from app.keyboards.message_buttons import (
    build_button_delete_confirmation_keyboard,
    build_button_editor_keyboard,
    build_button_picker_keyboard,
    build_button_position_keyboard,
    build_button_style_keyboard,
    build_button_type_keyboard,
    build_buttons_manager_keyboard,
    build_message_buttons_keyboard,
    build_page_target_keyboard,
)
from app.keyboards.pages import (
    build_page_delete_confirmation_keyboard,
    build_page_sort_keyboard,
    build_pages_keyboard,
    build_page_restore_keyboard,
)
from app.keyboards.publishing import (
    build_chat_reached_keyboard,
    build_post_chats_keyboard,
    build_post_confirmation_keyboard,
    build_post_settings_keyboard,
)

__all__ = [name for name in globals() if name.startswith("build_")]

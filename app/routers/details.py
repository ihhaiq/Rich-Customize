from __future__ import annotations

from typing import Any

from aiogram import Bot
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.editor.document import (
    add_block,
    delete_block,
    get_block_by_id,
    move_block,
    normalize_block_positions,
    replace_block,
)
from app.i18n import t
from app.keyboards import build_details_content_keyboard
from app.services.blocks import BLOCK_LABELS


def details_children(details: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the canonical child list used by every Details operation."""
    data = details.setdefault("data", {})
    children = data.get("children")
    if not isinstance(children, list):
        children = []
        data["children"] = children
    return normalize_block_positions(children)


def details_child(details: dict[str, Any], child_id: str) -> dict[str, Any] | None:
    return get_block_by_id(details_children(details), child_id)


def detach_native_details(details: dict[str, Any]) -> None:
    """Switch a received native Details block to the editable editor model."""
    data = details.setdefault("data", {})
    details["source"] = "generated"
    for key in ("native", "native_data", "native_type", "html"):
        data.pop(key, None)


def add_details_child(
    details: dict[str, Any],
    child: dict[str, Any],
    *,
    index: int | None = None,
) -> dict[str, Any]:
    detach_native_details(details)
    return add_block(details_children(details), child, index=index)


def delete_details_child(details: dict[str, Any], child_id: str) -> bool:
    detach_native_details(details)
    return delete_block(details_children(details), child_id)


def move_details_child(details: dict[str, Any], child_id: str, new_index: int) -> bool:
    detach_native_details(details)
    return move_block(details_children(details), child_id, new_index)


def replace_details_child(
    details: dict[str, Any],
    child_id: str,
    replacement: dict[str, Any],
) -> dict[str, Any] | None:
    detach_native_details(details)
    return replace_block(details_children(details), child_id, replacement)


def details_builder_text(payload: dict[str, Any]) -> str:
    count = len(payload.get("children") or [])
    return (
        "ابنِ محتوى «تفاصيل».\n\n"
        f"عدد البلوكات الداخلية: {count}\n"
        "أرسل نصًا أو وسائط مباشرة للإنهاء، أو أضف بلوكات داخلية."
    )


def details_inner_list_text(details: dict[str, Any]) -> str:
    children = details_children(details)
    lines = [
        t("details.inner_list_title"),
        t("details.inner_count", count=len(children)),
        "",
    ]
    for position, child in enumerate(children, start=1):
        label = BLOCK_LABELS.get(str(child.get("type", "")), t("block.content"))
        lines.append(f"{position}. {label}")
    lines.extend(["", t("common.choose_action")])
    return "\n".join(lines)


def details_inner_page(
    details: dict[str, Any],
    child: dict[str, Any],
) -> str:
    children = details_children(details)
    position = children.index(child) + 1
    label = BLOCK_LABELS.get(str(child.get("type", "")), t("block.content"))
    lines = [
        t("details.inner_settings_title"),
        t("details.inner_type", name=label),
        t("details.inner_position", current=position, total=len(children)),
        "",
        t("common.choose_action"),
    ]
    return "\n".join(lines)


def install_into(core: Any) -> None:
    """Move Details helpers out of the legacy router without breaking handlers.

    The historical callbacks still call these global names, so installing the
    shared implementations keeps their behavior while Details data mutations
    use the same document operations as top-level blocks.
    """
    core._details_children = details_children
    core._details_child = details_child
    core._details_builder_text = details_builder_text
    core._details_inner_list_text = details_inner_list_text
    core._details_inner_page = details_inner_page

    async def _store_details_child(
        message: Message,
        state: FSMContext,
        bot: Bot,
        child: dict[str, Any],
    ) -> None:
        data = await state.get_data()
        payload = dict(data.get("add_payload") or {})
        children = list(payload.get("children") or [])
        add_block(children, child)
        payload["children"] = children
        for key in (
            "child_quote_text",
            "child_quote_html",
            "child_media_children",
            "child_heading_size",
            "child_list_kind",
        ):
            payload.pop(key, None)
        await core._delete_add_step_messages(bot, message, data, state)
        await state.update_data(
            pending_add_type="details",
            pending_child_type=None,
            add_step="details_content",
            add_payload=payload,
        )
        await core._send_add_prompt(
            message,
            state,
            details_builder_text(payload),
            build_details_content_keyboard(len(children)),
        )

    core._store_details_child = _store_details_child


__all__ = [
    "add_details_child",
    "delete_details_child",
    "details_builder_text",
    "details_child",
    "details_children",
    "details_inner_list_text",
    "details_inner_page",
    "detach_native_details",
    "install_into",
    "move_details_child",
    "replace_details_child",
]

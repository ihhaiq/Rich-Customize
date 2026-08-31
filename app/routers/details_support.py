from __future__ import annotations

from typing import Any

from aiogram.fsm.context import FSMContext

from app.editor.draft_store import draft_store
from app.i18n import t
from app.services.blocks import BLOCK_LABELS
from app.services.details_editor import (
    DETAILS_TYPE,
    add_details_child,
    delete_details_child,
    detach_native_details,
    details_child,
    details_children,
    move_details_child,
    replace_details_child,
    replace_details_children,
)


def details_builder_text(payload: dict[str, Any]) -> str:
    return t("details.builder_text", count=len(payload.get("children") or []))


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


def details_inner_page(details: dict[str, Any], child: dict[str, Any]) -> str:
    children = details_children(details)
    position = children.index(child) + 1
    label = BLOCK_LABELS.get(str(child.get("type", "")), t("block.content"))
    return "\n".join([
        t("details.inner_settings_title"),
        t("details.inner_type", name=label),
        t("details.inner_position", current=position, total=len(children)),
        "",
        t("common.choose_action"),
    ])


async def save_document(state: FSMContext, blocks: list[dict[str, Any]]) -> None:
    draft = await draft_store.load(state)
    draft.blocks = blocks
    await draft_store.save(state, draft)


__all__ = [
    "DETAILS_TYPE",
    "add_details_child",
    "delete_details_child",
    "detach_native_details",
    "details_builder_text",
    "details_child",
    "details_children",
    "details_inner_list_text",
    "details_inner_page",
    "move_details_child",
    "replace_details_child",
    "replace_details_children",
    "save_document",
]

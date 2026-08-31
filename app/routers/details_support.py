from __future__ import annotations

from typing import Any

from aiogram.fsm.context import FSMContext

from app.editor.draft_store import draft_store
from app.editor.workflow import editor_workflow
from app.i18n import t
from app.services.blocks import BLOCK_LABELS

DETAILS_TYPE = "details"


def details_children(details: dict[str, Any]) -> list[dict[str, Any]]:
    data = details.setdefault("data", {})
    children = data.get("children")
    if not isinstance(children, list):
        children = []
        data["children"] = children
    return children


def details_child(details: dict[str, Any], child_id: str) -> dict[str, Any] | None:
    return next(
        (child for child in details_children(details) if child.get("id") == child_id),
        None,
    )


def detach_native_details(details: dict[str, Any]) -> None:
    data = details.setdefault("data", {})
    details["source"] = "generated"
    for key in ("native", "native_data", "native_type", "html"):
        data.pop(key, None)


def replace_details_children(
    details: dict[str, Any],
    children: list[dict[str, Any]],
) -> None:
    normalized: list[dict[str, Any]] = []
    for child in children:
        normalized = editor_workflow.add(normalized, child).blocks
    detach_native_details(details)
    details.setdefault("data", {})["children"] = normalized


def add_details_child(
    details: dict[str, Any],
    child: dict[str, Any],
    *,
    index: int | None = None,
) -> dict[str, Any]:
    result = editor_workflow.add(details_children(details), child, index=index)
    detach_native_details(details)
    details["data"]["children"] = result.blocks
    assert result.block is not None
    return result.block


def delete_details_child(details: dict[str, Any], child_id: str) -> bool:
    result = editor_workflow.delete(details_children(details), child_id)
    if result.changed:
        detach_native_details(details)
        details["data"]["children"] = result.blocks
    return result.changed


def move_details_child(details: dict[str, Any], child_id: str, new_index: int) -> bool:
    result = editor_workflow.move(details_children(details), child_id, new_index)
    if result.changed:
        detach_native_details(details)
        details["data"]["children"] = result.blocks
    return result.changed


def replace_details_child(
    details: dict[str, Any],
    child_id: str,
    replacement: dict[str, Any],
) -> dict[str, Any] | None:
    result = editor_workflow.replace(details_children(details), child_id, replacement)
    if not result.changed:
        return None
    detach_native_details(details)
    details["data"]["children"] = result.blocks
    return result.block


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

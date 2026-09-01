from __future__ import annotations

from typing import Any

from app.editor.workflow import editor_workflow

DETAILS_TYPE = "details"


def details_children(details: dict[str, Any]) -> list[dict[str, Any]]:
    data = details.setdefault("data", {})
    children = data.get("children")
    if not isinstance(children, list):
        children = []
        data["children"] = children
    children.sort(key=lambda child: int(child.get("position", 0)))
    for position, child in enumerate(children):
        child["position"] = position
    return children


def find_details_child(details: dict[str, Any], child_id: str) -> dict[str, Any] | None:
    return next((child for child in details_children(details) if child.get("id") == child_id), None)


def detach_native_details(details: dict[str, Any]) -> None:
    data = details.setdefault("data", {})
    details["source"] = "generated"
    data["native"] = False
    for key in ("native_data", "native_type", "html"):
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


# Short compatibility name retained for callers migrated from details_support.
details_child = find_details_child


__all__ = [
    "DETAILS_TYPE",
    "add_details_child",
    "delete_details_child",
    "detach_native_details",
    "details_child",
    "details_children",
    "find_details_child",
    "move_details_child",
    "replace_details_child",
    "replace_details_children",
]

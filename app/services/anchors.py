from __future__ import annotations

import html
import uuid
from typing import Any, Iterable

from app.editor.models import normalize_block, normalize_blocks


def anchor_name(block: dict[str, Any]) -> str:
    if block.get("type") != "anchor":
        return ""
    data = block.get("data", {})
    return str(data.get("text") or data.get("name") or "").strip()


def anchor_display_name(block: dict[str, Any]) -> str:
    if block.get("type") != "anchor":
        return ""
    data = block.get("data", {})
    return str(data.get("display_name") or anchor_name(block)).strip()


def anchor_target_id(block: dict[str, Any]) -> str | None:
    if block.get("type") != "anchor":
        return None
    value = block.get("data", {}).get("target_block_id")
    return str(value) if value else None


def anchor_targets(
    blocks: Iterable[dict[str, Any]],
    *,
    exclude_ids: Iterable[str] = (),
) -> list[dict[str, Any]]:
    excluded = {str(value) for value in exclude_ids}
    return [
        block
        for block in blocks
        if block.get("type") != "anchor" and str(block.get("id")) not in excluded
    ]


def linked_anchors(
    blocks: Iterable[dict[str, Any]],
    target_block_id: str,
) -> list[dict[str, Any]]:
    target = str(target_block_id)
    return [block for block in blocks if anchor_target_id(block) == target]


def new_anchor_data(
    display_name: str,
    target_block_id: str,
    *,
    existing_names: Iterable[str] = (),
) -> dict[str, Any]:
    label = " ".join(str(display_name).split()).strip()[:64]
    used = {str(value) for value in existing_names}
    name = ""
    while not name or name in used:
        name = f"anchor_{uuid.uuid4().hex[:10]}"
    return {
        "text": name,
        "display_name": label,
        "target_block_id": str(target_block_id),
        "html": f'<a name="{html.escape(name, quote=True)}"></a>',
    }


def set_anchor_display_name(block: dict[str, Any], display_name: str) -> bool:
    if block.get("type") != "anchor":
        return False
    label = " ".join(str(display_name).split()).strip()[:64]
    if not label:
        return False
    block.setdefault("data", {})["display_name"] = label
    return True


def set_anchor_target(
    blocks: list[dict[str, Any]],
    anchor_id: str,
    target_block_id: str,
) -> bool:
    target = next(
        (
            block
            for block in blocks
            if str(block.get("id")) == str(target_block_id)
            and block.get("type") != "anchor"
        ),
        None,
    )
    anchor = next(
        (
            block
            for block in blocks
            if str(block.get("id")) == str(anchor_id)
            and block.get("type") == "anchor"
        ),
        None,
    )
    if anchor is None or target is None:
        return False
    anchor.setdefault("data", {})["target_block_id"] = str(target["id"])
    align_linked_anchors(blocks)
    return True


def retarget_linked_anchors(
    blocks: list[dict[str, Any]],
    old_target_id: str,
    new_target_id: str,
) -> bool:
    target = next(
        (
            block
            for block in blocks
            if str(block.get("id")) == str(new_target_id)
            and block.get("type") != "anchor"
        ),
        None,
    )
    anchors = linked_anchors(blocks, old_target_id)
    if target is None or not anchors:
        return False
    for anchor in anchors:
        anchor.setdefault("data", {})["target_block_id"] = str(target["id"])
    align_linked_anchors(blocks)
    return True


def align_linked_anchors(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep every linked anchor immediately before its target block.

    Imported/legacy anchors without a target remain exactly where the user put
    them, so old pages keep their existing behavior.
    """
    normalize_blocks(blocks)
    target_ids = {
        str(block.get("id"))
        for block in blocks
        if block.get("type") != "anchor"
    }
    grouped: dict[str, list[dict[str, Any]]] = {}
    linked_ids: set[str] = set()
    for block in blocks:
        target_id = anchor_target_id(block)
        if target_id and target_id in target_ids:
            grouped.setdefault(target_id, []).append(block)
            linked_ids.add(str(block.get("id")))

    ordered: list[dict[str, Any]] = []
    for block in blocks:
        if str(block.get("id")) in linked_ids:
            continue
        block_id = str(block.get("id"))
        ordered.extend(grouped.get(block_id, ()))
        ordered.append(block)
    blocks[:] = ordered
    for index, block in enumerate(blocks):
        normalize_block(block, position=index)
    return blocks


__all__ = [
    "align_linked_anchors",
    "anchor_display_name",
    "anchor_name",
    "anchor_target_id",
    "anchor_targets",
    "linked_anchors",
    "new_anchor_data",
    "retarget_linked_anchors",
    "set_anchor_display_name",
    "set_anchor_target",
]

from __future__ import annotations

from typing import Any

from app.i18n import t
from app.services.blocks import BLOCK_LABELS
from app.services.anchors import anchor_display_name, anchor_target_id


def block_page(block: dict[str, Any], blocks: list[dict[str, Any]]) -> str:
    ordered = sorted(blocks, key=lambda item: int(item.get("position", 0)))
    try:
        index = ordered.index(block) + 1
    except ValueError:
        index = 1
    name = BLOCK_LABELS.get(str(block.get("type", "")), t("block.content"))
    lines = [
        t("block.manage_title", name=name),
        t("block.position_text", current=index, total=len(ordered)),
        "",
        t("block.order_text"),
    ]
    for position, item in enumerate(ordered, start=1):
        label = BLOCK_LABELS.get(
            str(item.get("type", "")),
            t("block.content"),
        )
        marker = "◀️ " if item.get("id") == block.get("id") else ""
        lines.append(f"{marker}{position}. {label}")

    if (
        block.get("type") == "list"
        and block.get("data", {}).get("kind") == "checklist"
    ):
        lines.extend(["", t("list.tasks_title")])
        for task_index, item in enumerate(
            block.get("data", {}).get("items", []),
            start=1,
        ):
            if not isinstance(item, dict):
                continue
            status = "☑️" if item.get("is_checked") else "☐"
            lines.append(f"{task_index}. {status} {item.get('text', '')}")

    if block.get("type") == "anchor":
        target_id = anchor_target_id(block)
        target = next(
            (item for item in ordered if str(item.get("id")) == target_id),
            None,
        )
        target_label = (
            BLOCK_LABELS.get(str(target.get("type", "")), t("block.content"))
            if target is not None
            else "—"
        )
        lines.extend(["", f"⚓ {anchor_display_name(block)}", f"↳ {target_label}"])

    lines.extend(["", t("common.choose_action")])
    return "\n".join(lines)


__all__ = ["block_page"]

from __future__ import annotations

import copy
import uuid
from typing import Any, Literal

BlockSource = Literal["generated", "imported", "native"]

SOURCE_GENERATED: BlockSource = "generated"
SOURCE_IMPORTED: BlockSource = "imported"
SOURCE_NATIVE: BlockSource = "native"
VALID_SOURCES = frozenset({SOURCE_GENERATED, SOURCE_IMPORTED, SOURCE_NATIVE})


def infer_source(data: dict[str, Any] | None, source: str | None = None) -> BlockSource:
    if source in VALID_SOURCES:
        return source  # type: ignore[return-value]
    payload = data or {}
    if payload.get("native") or isinstance(payload.get("native_data"), dict):
        return SOURCE_NATIVE
    return SOURCE_GENERATED


def make_block(
    block_type: str,
    data: dict[str, Any] | None = None,
    *,
    position: int = 0,
    source: str | None = None,
    block_id: str | None = None,
) -> dict[str, Any]:
    """Create the canonical editor block shape.

    ``source`` lives at block level. ``data["native"]`` is retained only for
    imported-payload compatibility. New code should inspect the top-level
    source instead.
    """
    payload = copy.deepcopy(data or {})
    resolved_source = infer_source(payload, source)
    if resolved_source == SOURCE_NATIVE:
        payload["native"] = True
    elif payload.get("native") is False:
        payload.pop("native", None)
    return {
        "id": block_id or uuid.uuid4().hex[:12],
        "type": str(block_type),
        "position": int(position),
        "source": resolved_source,
        "data": payload,
    }


def normalize_block(
    block: dict[str, Any],
    *,
    position: int | None = None,
) -> dict[str, Any]:
    """Upgrade a legacy block in-place to the canonical shape."""
    block.setdefault("id", uuid.uuid4().hex[:12])
    block["type"] = str(block.get("type", "content"))
    if position is not None:
        block["position"] = int(position)
    else:
        try:
            block["position"] = int(block.get("position", 0))
        except (TypeError, ValueError):
            block["position"] = 0

    data = block.get("data")
    if not isinstance(data, dict):
        data = {}
        block["data"] = data

    source = infer_source(data, block.get("source"))
    block["source"] = source
    if source == SOURCE_NATIVE:
        data["native"] = True

    children = data.get("children")
    if isinstance(children, list):
        normalize_blocks(children)

    items = data.get("items")
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict) and isinstance(item.get("blocks"), list):
                normalize_blocks(item["blocks"])
    return block


def normalize_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    blocks.sort(key=lambda item: _safe_position(item.get("position")))
    for index, block in enumerate(blocks):
        normalize_block(block, position=index)
    return blocks


def clone_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cloned = copy.deepcopy(blocks)
    return normalize_blocks(cloned)


def _safe_position(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0

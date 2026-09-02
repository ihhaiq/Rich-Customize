from __future__ import annotations

from typing import Any, Literal, TypeAlias


BlockSource = Literal["generated", "imported", "native"]
BlockData: TypeAlias = dict[str, Any]
Block: TypeAlias = dict[str, Any]
BlockList: TypeAlias = list[Block]


__all__ = ["Block", "BlockData", "BlockList", "BlockSource"]

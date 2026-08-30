from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class InputKind(str, Enum):
    TEXT = "text"
    TELEGRAM = "telegram"
    NATIVE = "native"
    AUTOMATIC = "automatic"
    CONTAINER = "container"


@dataclass(frozen=True, slots=True)
class BlockAdapter:
    block_type: str
    input_kind: InputKind
    aliases: tuple[str, ...] = ()
    child_types: tuple[str, ...] = ()
    supports_caption: bool = False

    @property
    def is_container(self) -> bool:
        return self.input_kind == InputKind.CONTAINER

    def validate(self, block: dict[str, Any]) -> tuple[str, ...]:
        if str(block.get("type", "")) not in {self.block_type, *self.aliases}:
            return (f"expected {self.block_type}",)
        if not isinstance(block.get("data"), dict):
            return ("block data must be a mapping",)
        return ()

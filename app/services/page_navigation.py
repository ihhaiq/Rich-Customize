from __future__ import annotations

import asyncio
import json
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


NAVIGATION_TTL_SECONDS = 24 * 60 * 60
MAX_NAVIGATION_DEPTH = 32


def _registry_path() -> Path:
    configured = os.getenv("PAGE_NAVIGATION_STATE", "").strip()
    return Path(configured) if configured else Path("data/page_navigation.json")


@dataclass(frozen=True, slots=True)
class PageNavigation:
    token: str
    user_id: int
    stack: tuple[str, ...]
    external_root: bool

    @property
    def root_page_id(self) -> str | None:
        return None if self.external_root or not self.stack else self.stack[0]

    @property
    def can_go_back(self) -> bool:
        return self.external_root or len(self.stack) > 1

    @property
    def can_go_home(self) -> bool:
        return len(self.stack) > (1 if self.external_root else 2)

    @property
    def is_at_root(self) -> bool:
        return not self.stack if self.external_root else len(self.stack) <= 1


class PageNavigationRegistry:
    """Persistent, user-scoped history for ephemeral saved-page navigation."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _registry_path()
        self._lock = asyncio.Lock()

    def _read(self) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return value if isinstance(value, dict) else {}

    def _write(self, sessions: dict[str, dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(
            json.dumps(sessions, ensure_ascii=False, indent=2), encoding="utf-8",
        )
        temporary.replace(self.path)

    @staticmethod
    def _cleanup(sessions: dict[str, dict[str, Any]], now: int) -> None:
        expired: list[str] = []
        for token, value in sessions.items():
            try:
                updated_at = int(value.get("updated_at", 0) or 0)
            except (AttributeError, TypeError, ValueError):
                updated_at = 0
            if updated_at < now - NAVIGATION_TTL_SECONDS:
                expired.append(token)
        for token in expired:
            sessions.pop(token, None)

    @staticmethod
    def _state(token: str, value: dict[str, Any]) -> PageNavigation | None:
        stack = value.get("stack")
        if not isinstance(stack, list) or not all(isinstance(item, str) for item in stack):
            return None
        try:
            user_id = int(value["user_id"])
        except (KeyError, TypeError, ValueError):
            return None
        return PageNavigation(
            token=token,
            user_id=user_id,
            stack=tuple(stack),
            external_root=bool(value.get("external_root", False)),
        )

    async def navigate(
        self,
        user_id: int,
        source_page_id: str | None,
        target_page_id: str,
        token: str | None = None,
    ) -> PageNavigation:
        async with self._lock:
            sessions = self._read()
            now = int(time.time())
            self._cleanup(sessions, now)
            current = self._state(token, sessions.get(token, {})) if token else None
            if current is None or current.user_id != user_id:
                token = secrets.token_hex(6)
                while token in sessions:
                    token = secrets.token_hex(6)
                stack = [source_page_id, target_page_id] if source_page_id else [target_page_id]
                external_root = source_page_id is None
            else:
                stack = list(current.stack)
                external_root = current.external_root
                if source_page_id:
                    matching = [i for i, item in enumerate(stack) if item == source_page_id]
                    stack = stack[:matching[-1] + 1] if matching else [source_page_id]
                if not stack or stack[-1] != target_page_id:
                    stack.append(target_page_id)
                if len(stack) > MAX_NAVIGATION_DEPTH:
                    stack = ([stack[0]] + stack[-(MAX_NAVIGATION_DEPTH - 1):])
            sessions[token] = {
                "user_id": int(user_id),
                "stack": stack,
                "external_root": external_root,
                "updated_at": now,
            }
            self._write(sessions)
            return PageNavigation(token, int(user_id), tuple(stack), external_root)

    async def back(self, token: str, user_id: int) -> PageNavigation | None:
        async with self._lock:
            sessions = self._read()
            now = int(time.time())
            self._cleanup(sessions, now)
            current = self._state(token, sessions.get(token, {}))
            if current is None or current.user_id != user_id or not current.can_go_back:
                self._write(sessions)
                return None
            stack = list(current.stack)
            previous_stack = list(stack)
            if stack:
                stack.pop()
            sessions[token] = {
                "user_id": current.user_id,
                "stack": stack,
                "previous_stack": previous_stack,
                "external_root": current.external_root,
                "updated_at": now,
            }
            self._write(sessions)
            return PageNavigation(
                token, current.user_id, tuple(stack), current.external_root,
            )

    async def home(self, token: str, user_id: int) -> PageNavigation | None:
        async with self._lock:
            sessions = self._read()
            now = int(time.time())
            self._cleanup(sessions, now)
            current = self._state(token, sessions.get(token, {}))
            if current is None or current.user_id != user_id:
                self._write(sessions)
                return None
            self._write(sessions)
            return current

    async def commit_back(self, token: str, user_id: int) -> None:
        async with self._lock:
            sessions = self._read()
            value = sessions.get(token)
            current = self._state(token, value if isinstance(value, dict) else {})
            if current is None or current.user_id != user_id or not isinstance(value, dict):
                return
            value.pop("previous_stack", None)
            value["updated_at"] = int(time.time())
            self._write(sessions)

    async def rollback_back(self, token: str, user_id: int) -> None:
        async with self._lock:
            sessions = self._read()
            value = sessions.get(token)
            current = self._state(token, value if isinstance(value, dict) else {})
            if current is None or current.user_id != user_id or not isinstance(value, dict):
                return
            previous = value.pop("previous_stack", None)
            if isinstance(previous, list) and all(isinstance(item, str) for item in previous):
                value["stack"] = previous
                value["updated_at"] = int(time.time())
                self._write(sessions)

    async def finish(self, token: str) -> None:
        async with self._lock:
            sessions = self._read()
            if sessions.pop(token, None) is not None:
                self._write(sessions)


page_navigation_registry = PageNavigationRegistry()

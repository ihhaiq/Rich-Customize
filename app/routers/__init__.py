"""Router package with lazy access to the composed application router.

Keeping package initialization side-effect free avoids circular imports while
feature routers are split from the legacy editor module.
"""
from __future__ import annotations

from importlib import import_module
from typing import Any


def __getattr__(name: str) -> Any:
    if name == "router":
        return import_module("app.routers.rich_editor").router
    raise AttributeError(name)


__all__ = ["router"]

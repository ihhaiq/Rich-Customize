"""Transparent compatibility alias for the remaining legacy editor handlers.

All new editor data/domain logic lives under :mod:`app.editor`.  Keeping this
module as an alias means old imports and test monkey-patches continue to target
the exact globals used by the historical handlers while the router is split.
"""
from __future__ import annotations

import sys

from app.routers import editor_legacy as _legacy

# Consumers such as rich_editor can explicitly patch/install compatibility
# helpers on the module that actually owns the legacy handler globals.
_legacy.compat_module = _legacy

# Make ``app.routers.editor_core`` and ``app.routers.editor_legacy`` resolve to
# the same module object. This preserves read AND write/patch compatibility.
sys.modules[__name__] = _legacy

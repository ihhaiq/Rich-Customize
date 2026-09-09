"""Public facade for shared localization data.

The large translation tables live in :mod:`common_data`. Runtime code should
prefer semantic ``t(...)`` keys; this module keeps the established imports
stable while the legacy source-string catalogs are retired gradually.
"""

from __future__ import annotations

from app.lang.catalogs.common_data import (
    AR_PHRASES,
    KEY_TRANSLATIONS,
    PHRASES,
    UX_KEY_ALIASES,
    pack,
    profile,
)

__all__ = [
    "AR_PHRASES",
    "KEY_TRANSLATIONS",
    "PHRASES",
    "UX_KEY_ALIASES",
    "pack",
    "profile",
]

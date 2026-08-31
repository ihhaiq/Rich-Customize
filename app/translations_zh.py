"""Compatibility re-export for the historical Chinese translation module.

Canonical Chinese translation data lives in ``app.lang.catalogs.chinese``.
This bridge remains only because ``i18n_core`` still owns the historical
Arabic-source normalization table during the semantic-i18n migration.
"""

from app.lang.catalogs.chinese import ZH_HANS, ZH_HANT

__all__ = ["ZH_HANS", "ZH_HANT"]

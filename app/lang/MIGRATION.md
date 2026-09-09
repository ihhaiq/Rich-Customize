# Localization migration status

- `app/lang/` owns every locale package and all shared translation catalogs.
- `app/locales/` has been removed; application code and tests must not import it.
- `app/i18n_runtime.py` owns runtime translation and language resolution.
- `app/i18n_profile.py` owns Telegram bot-profile synchronization.
- `app/i18n.py` is the stable public facade.
- `app/lang/catalogs/chinese.py` is the canonical Chinese translation source; `i18n_core` imports it directly.
- Shared historical translation datasets live in `app/lang/catalogs/common_data.py`; `common.py` is only the stable public catalog facade.
- New UI must use semantic `t("...")` keys. High-traffic editor/keyboards have moved to semantic keys; `tr()` remains only for legacy source-string flows that have not been migrated yet.

The remaining localization cleanup is to move the last historical source-normalization entries out of `i18n_core.py` as the remaining legacy routers are converted to semantic keys.

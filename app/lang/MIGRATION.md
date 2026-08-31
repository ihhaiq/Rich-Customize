# Localization migration status

- `app/lang/` owns every locale package and all shared translation catalogs.
- `app/locales/` has been removed; application code and tests must not import it.
- `app/i18n_runtime.py` owns runtime translation and language resolution.
- `app/i18n_profile.py` owns Telegram bot-profile synchronization.
- `app/i18n.py` is the stable public facade.
- `app/lang/catalogs/chinese.py` owns Chinese translation data; `app/translations_zh.py` is only a data-free compatibility re-export for `i18n_core`.
- New UI must use semantic `t("...")` keys; `tr()` is retained only for historical source strings that still rely on Arabic-to-English normalization.

The next localization cleanup is gradually moving the historical source-normalization table out of `i18n_core.py` as remaining hardcoded UI strings are converted to semantic keys.

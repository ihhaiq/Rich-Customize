# Localization migration status

- `app/lang/` owns locale packages and shared catalogs.
- `app/i18n_runtime.py` owns runtime translation and language resolution.
- `app/i18n_profile.py` owns Telegram bot-profile synchronization.
- `app/i18n.py` is the stable public facade.
- `app/locales/` is compatibility-only and must not contain independent data.
- New UI must use semantic `t("...")` keys; `tr()` is retained only for historical source strings.

The remaining cleanup task is removing the compatibility `app/locales` shims once all internal imports and tests use `app.lang` directly.

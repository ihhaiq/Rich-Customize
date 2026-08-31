# Language packages

`app.lang` is the canonical locale package for the bot.

Each supported Telegram locale has its own package under `app/lang/<locale>/`.
Shared translation catalogs and source-string compatibility maps live under
`app/lang/catalogs/`; no runtime translation data is owned by `app.locales`.

Chinese Telegram locale codes remain `zh-hans` and `zh-hant`, while their
Python package names are `zh_hans` and `zh_hant`.

Application code should import public locale registries from `app.lang` and UI
code should prefer semantic `t("...")` keys. Historical `tr()` source-string
translation remains only as a compatibility path while old UI strings are
migrated.

`app.lang` exports the existing public registries (`PHRASES`, `AR_PHRASES`,
`KEY_TRANSLATIONS`, `TRANSLATIONS`, catalog data, profiles and supported
languages), so the public localization behavior remains stable during cleanup.

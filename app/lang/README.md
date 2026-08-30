# Language packages

`app.lang` is the canonical locale entry point for the bot.

Each supported Telegram locale has its own package:

- `ar/`, `en/`
- `es/`, `fr/`, `de/`, `it/`, `pt/`, `nl/`, `pl/`, `uk/`, `ru/`
- `tr/`, `fa/`, `ku/`, `ur/`
- `hi/`, `id/`, `ja/`, `ko/`, `vi/`, `th/`
- `zh_hans/`, `zh_hant/` for locale codes `zh-hans` and `zh-hant`

Application code must import locale registries from `app.lang`, not from
`app.locales.*`.

The old `app/locales/` modules are a compatibility source while the historical
translation dictionaries are being physically migrated. They must not receive
new router/UI strings. New language-specific copy belongs to the matching
`app/lang/<locale>/` package so the compatibility source can be deleted after
migration.

`app.lang` deliberately preserves the existing public dictionaries
(`PHRASES`, `AR_PHRASES`, `KEY_TRANSLATIONS`, `TRANSLATIONS`, catalog data and
profiles), so `t()` and `tr()` do not change behavior during the reorganization.

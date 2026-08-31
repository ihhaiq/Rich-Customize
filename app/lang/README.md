# Language packages

`app.lang` is the canonical locale entry point for the bot.

Each supported Telegram locale has its own package:

- `ar/`, `en/`
- `es/`, `fr/`, `de/`, `it/`, `pt/`, `nl/`, `pl/`, `uk/`, `ru/`
- `tr/`, `fa/`, `ku/`, `ur/`
- `hi/`, `id/`, `ja/`, `ko/`, `vi/`, `th/`
- `zh_hans/`, `zh_hant/` for locale codes `zh-hans` and `zh-hant`

Application code imports locale registries from `app.lang`. Shared historical
translation catalogs live under `app/lang/catalogs/`; there is no second
`app.locales` runtime source.

Each language package exposes a `BUNDLE` built by `app.lang.bundle_loader`.
`app.lang` preserves the public dictionaries used by the application
(`PHRASES`, `AR_PHRASES`, `KEY_TRANSLATIONS`, `TRANSLATIONS`, catalog data and
profiles), so `t()` and the temporary source-text `tr()` compatibility path keep
their existing behavior while semantic-key migration continues.

New UI copy should use semantic keys and be registered in the language/catalog
layer rather than embedded in routers or keyboards.

# Locale migration status

The runtime now consumes translations through `app.lang`, with one package per
supported locale. The historical grouped modules in `app/locales/` are still
loaded only by `app/lang/_legacy_source.py` so this reorganization can land
without changing any translated text.

Next migration rule:

1. Move a locale's literal dictionaries into its `app/lang/<locale>/` package.
2. Remove that locale from the grouped compatibility source.
3. Keep the exported `LocaleBundle` shape unchanged.
4. Delete `app/lang/_legacy_source.py` and `app/locales/` after the final locale
   is physically migrated.

No new UI translation should be added to the grouped compatibility files.

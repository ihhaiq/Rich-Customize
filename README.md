# Rich Customize — Telegram Serverless migration

Branch: `serverless-cleanup`

Rich Customize is being moved from Python/Aiogram/Railway to Telegram Serverless JavaScript.

Official platform guide: https://core.telegram.org/bots/serverless

The scaffold SDK reference is kept at `docs/tgcloud-sdk.md`.

## Converted

- `/start` welcome and idle-private behavior
- persisted `/editor` session/state and full editor navigation/history
- all 21 current rich block types from `main`, including nested Details, tables, lists/checklists, quotes, media, collage/slideshow, maps, anchors and Math
- Rich Message import/render/preview, including native media conversion and ready Rich Math input
- message buttons, custom row layouts, popup/CBD callbacks and page navigation
- current Pages flows used by the editor: search, sort, save/update/open, rename, delete and restore
- guest/inline page navigation and publish-to-chat flows
- request throttling/idempotency and persistent usage/operational statistics
- `/draft` + `r:showcase` and showcase-channel media capture
- developer panel with in-place callback updates, import/export, DB checks, statistics, snapshots and showcase refresh
- localized bot UI and bot profile for `ar`, `en`, `es`, `de`, `it`, `pt`, `nl`, `pl`, `uk`, `ru`, `tr`, `ur`, `hi`, `id`, `ja`, `ko`, `vi`, `th`, `zh-hans` and `zh-hant`
- locale resolution from the current Telegram `from.language_code`, then the last stored user language, then English
- developer-only `/app` shortcut to the named Mini App

The remaining Python files are reference material only; tgcloud does not deploy them.

Current intentional exceptions:

- the developer panel remains Arabic-only by design and is outside normal user-facing localization
- the Mini App is explicitly deferred as a separate future task; only the bot-side `/app` shortcut exists in Serverless today
- the existing Mini App HTTP/API/static implementation under `app/webapp/` and `app/miniapp_static/` is not part of the current Serverless migration scope

## Backup compatibility

The old `rich-customize-json-backup-v1` format is supported. Saved pages preserve their `page_id`, owner, blocks, buttons, layout, and timestamps. Imported `managed_chats.json` is hydrated into the live `managed_chats` / `managed_publish_panels` tables and current exports rebuild that file from those live tables. Compatibility namespaces such as old popup, Guest and page-navigation state are retained in `legacy_states` and restored lazily where required. `rich_media.json` remains legacy metadata only because reusable Telegram `file_id` values are already preserved inside page blocks.

The 12-page rule never prunes old/imported pages. It only prevents creation of a new page when the owner is already at or above the limit.

## Developer access

`/dev` stays closed until numeric Telegram developer IDs are added to `lib/developer-access.js`. If the list is empty, `/dev` tells the sender their own Telegram ID so it can be configured deliberately.

## Deployment

```bash
npx tgcloud status
npx tgcloud diff
npx tgcloud push
npx tgcloud migrate
npx tgcloud webhook sync
```

Run `migrate` only after reviewing the schema changes reported by `push`.

## Localization

The current Serverless bot UI migration is locale-aware for these supported locales:

`ar`, `en`, `es`, `de`, `it`, `pt`, `nl`, `pl`, `uk`, `ru`, `tr`, `ur`, `hi`, `id`, `ja`, `ko`, `vi`, `th`, `zh-hans`, `zh-hant`.

Intentionally removed locales are `fr`, `fa`, `ku` and `he`.

Locale resolution is:

```text
current Update from.language_code
↓
last language stored in usage_users
↓
English
```

New and migrated UI should use semantic `t(locale, key)` keys. Historical source-copy still uses `tr(locale, source)` as a compatibility path: exact source translations are preferred, then matching semantic translations, then the native compatibility fallback inherited from the migration architecture.

Traditional Chinese is resolved for `zh-Hant`, Taiwan, Hong Kong and Macao language tags; other Chinese tags resolve to Simplified Chinese. User-authored text and imported message content are kept verbatim and are never translated.

Bot profile localization is separate from per-update UI localization and is synchronized through `lib/bot-profile.js`.

Localization files are intentionally split into small Serverless modules:

- `lib/i18n.js` — locale resolution plus `t()` / `tr()`
- `lib/i18n-keys.js` — shared semantic key order and supported locale list
- `lib/lang/*.js` — one compact value catalog per supported locale
- `lib/i18n-source.js` — legacy source-string compatibility translations and UI fallback terms
- `lib/bot-profiles.js` — localized Telegram bot profile text

Do not rebuild one monolithic generated localization module; keep locale catalogs isolated so individual language files stay small and easy to update.

## Remaining scope

The Telegram bot-side Serverless migration is complete for the current non-Mini-App scope. The full Mini App remains deliberately deferred and still requires separate HTTPS hosting. After pulling branch changes locally, use `tgcloud diff` / `push` and run the deployment smoke checks before treating a specific Telegram Cloud revision as validated.

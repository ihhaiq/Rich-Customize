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
- developer-configurable error-log channel with test/disable controls, sanitized diagnostics and duplicate-error suppression
- localized bot UI and bot profile for `ar`, `en`, `es`, `de`, `it`, `pt`, `nl`, `pl`, `uk`, `ru`, `tr`, `ur`, `hi`, `id`, `ja`, `ko`, `vi`, `th`, `zh-hans` and `zh-hant`
- locale resolution from the current Telegram `from.language_code`, then the last stored user language, then English
- non-English UI never silently falls back to English: exact translations are preferred, then native semantic fallback copy for any still-untranslated key
- developer-only `/app` shortcut to the named Mini App
- first Telegram B2B Mini App bridge slice for `@Richminiappsbot`: private bridge-group routing, request IDs, rate limiting, page list/read/create/save/delete operations, JSON document transfer, optimistic save conflicts and error-log integration

The converted Python bot entrypoint, routers and keyboard modules were removed from `serverless-cleanup`. Remaining Python is kept only for the deferred Mini App HTTP backend/dependency chain and for old reference tests; tgcloud does not deploy it.

Current intentional exceptions:

- the developer panel remains Arabic-only by design and is outside normal user-facing localization
- the Mini App frontend is still hosted separately over HTTPS; Telegram Serverless remains the source of truth for saved pages
- the B2B bridge receiver now exists on the Serverless side, while the Cloudflare-side `@Richminiappsbot` relay/webhook is the next integration step
- the older D1-oriented Mini App API under `functions/miniapp/api/` must not be treated as the production page store during the B2B migration

## Mini App B2B bridge — current integration

The current Mini App plan keeps the persistent page data in Telegram Serverless. Cloudflare is only the HTTPS frontend + stateless relay for the separate Mini App bot.

```text
Mini App frontend / Cloudflare
        ↓ HTTPS
@Richminiappsbot relay
        ↓ Telegram message/document
private bridge group
        ↓
@RichCustomizebot / Telegram Serverless
        ↓
rich_pages
```

Configured Serverless bridge identity:

- Mini App bot username: `@Richminiappsbot`
- private bridge group: `-1003993506865`
- the first valid bridge message pins the Mini App bot numeric Telegram ID in the Serverless `legacy_states` bridge config; later requests must come from that same bot ID
- ordinary group behavior is unchanged; the bot remains silent in other groups unless another supported command flow already handles the update

Bridge protocol version: `RCB1`.

Supported request commands:

```text
/rcb_ping@RichCustomizebot
/rcb_pages@RichCustomizebot
/rcb_page@RichCustomizebot
/rcb_create@RichCustomizebot
/rcb_save@RichCustomizebot
/rcb_delete@RichCustomizebot
```

Each command carries a JSON metadata object after the command. Read responses are returned as JSON documents. Create/save payloads are sent as JSON documents so page data is not constrained by normal Telegram message text length.

Example page-list request:

```text
/rcb_pages@RichCustomizebot
{"request_id":"req_01HXYZ123","user_id":123456789}
```

Example page request:

```text
/rcb_page@RichCustomizebot
{"request_id":"req_01HXYZ124","user_id":123456789,"page_id":"a81f39"}
```

For `SAVE_PAGE`, the attached JSON must include the same `request_id`, `user_id` and `page_id` as the caption metadata plus `base_updated_at`. The Serverless update is conditional on that revision, so an older Mini App session receives `PAGE_CONFLICT` instead of overwriting newer data.

Bridge safety currently includes:

- exact bridge-chat restriction
- Telegram bot sender check + configured username check + numeric bot-ID pinning
- per-action sliding-window rate limiting
- persistent short-lived `request_id` deduplication for safe mutation retries
- 2 MB bridge JSON-document ceiling
- owner checks for every page read/write/delete
- existing editor block/resource validation before create/save
- 12-page creation limit with developer exemption
- mutation conflict detection using `updated_at`
- no page payloads are written to error logs

The Mini App frontend also includes a non-dismissible blocking wait overlay in `app/miniapp_static/loading_overlay.*`. It appears immediately during boot and wraps page-list loading, page opening, explicit new-page preparation and manual save. While active, the editor and sheets are `inert`, scrolling/touch interaction is blocked, and the only visible state is a light liquid-glass card with “انتظر شوية…” plus an optional operation hint. The same controller is exposed as `window.MiniAppWait` / `window.withMiniAppWait` for the upcoming Cloudflare B2B relay calls.

Bridge failures and security alerts use the existing developer-configured error-log channel. Dedicated scopes cover request failures, reply failures, bridge state failures, rate-limit alerts and unauthorized bridge access.

Because `miniapp_bridge_requests` is a new Serverless table, deployment requires reviewing and applying the schema migration:

```bash
npx tgcloud diff
npx tgcloud push
npx tgcloud migrate
npx tgcloud webhook sync
```

Bot-to-Bot Communication Mode must be enabled as required by Telegram for the participating bots. In the bridge group, the relay should address commands directly to the main bot (for example `/rcb_page@RichCustomizebot`) so delivery does not depend on broad group-message visibility.

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

The Telegram bot-side Serverless migration is complete for the existing editor scope. Mini App integration is now in the B2B bridge phase: the Serverless receiver is implemented, while the Cloudflare relay/webhook and frontend switch away from the old D1 API remain to be completed and smoke-tested. After pulling branch changes locally, use `tgcloud diff` / `push`, apply the new schema migration, sync the webhook, and run the bridge smoke checks before treating a Telegram Cloud revision as validated.

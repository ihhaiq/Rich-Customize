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
- developer-only `/app` shortcut to the named Mini App

The remaining Python files are reference material only; tgcloud does not deploy them.

Current intentional exceptions:

- full localization/i18n parity is the next migration phase
- the Mini App is explicitly deferred as a separate future task; only the bot-side `/app` shortcut exists in Serverless today
- the existing Mini App HTTP/API/static implementation under `app/webapp/` and `app/miniapp_static/` is not part of the current Serverless migration scope

## Backup compatibility

The old `rich-customize-json-backup-v1` format is supported. Saved pages preserve their `page_id`, owner, blocks, buttons, layout, and timestamps. Other old JSON namespaces are stored in `legacy_states` until their feature is ported.

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

## Next

Migrate the localization architecture from `main` to Serverless so every Telegram user receives bot UI in their resolved Telegram language. Keep semantic translation keys, preserve user-authored content verbatim, and localize the bot profile (name, descriptions and commands) separately from per-update UI text.

The Mini App remains a deferred task and must not be mixed into the localization migration.

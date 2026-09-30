# AGENTS.md — Rich Customize Serverless

This branch migrates Rich Customize from Python/Aiogram to Telegram Serverless JavaScript.

## References

Use the official Telegram references for Serverless and Bot API behavior:

1. https://core.telegram.org/bots/serverless
2. https://core.telegram.org/bots/api

## Runtime rules

- Telegram runs deployed modules in an isolated V8 runtime.
- Deployable code is root `schema.js`, JavaScript under `lib/`, and one-level `handlers/*.js`.
- Runtime imports use bare module names only: `from 'sdk'`, `from 'sdk/db'`, `from 'schema'`, `from 'lib/...'`.
- No Python runtime, project filesystem access, or npm package resolution exists inside handlers.
- Handler default exports receive the update payload directly; the full Update is available through the handler context.
- Bot API calls use `api.<method>({...})` with Bot API snake_case parameters.
- Bot API failures throw `BotApiError`.
- Use `InputFile` for uploads and `api.getFileContent(file_id)` / `getFileStream` for downloads. Telegram's Bot API download ceiling is 20 MB.
- Database calls are async and must always be awaited.
- Serverless DB schema belongs in root `schema.js`. Do not use foreign keys.
- `tgcloud push` deploys code; `tgcloud migrate` applies schema changes separately.
- Never commit `.tgcloud/`, credentials, bot tokens, or `node_modules/`.

## Migration status

Converted Serverless slices:

- `/start` welcome and idle-private welcome behavior
- `/editor` persisted one-session-per-user editor
- all 21 current rich block types from `main`, including add/edit/preview/import/render flows
- Details nested-block management, table controls, checklist toggles, quotes, media, collage/slideshow albums and ready Rich Math input
- message-button editor, custom row layout, CBD/page buttons, popup/callback compatibility and button guide
- current Pages behavior needed by the editor: list/search/sort/open/save/update/rename/delete/restore
- undo/redo, editor expiry guards, request throttling/idempotency and persistent usage stats
- full preview, saved-page delivery/navigation, guest/inline navigation and publishing to managed groups/channels
- `/draft` and `r:showcase` all-block showcase plus showcase-channel media capture
- `/dev` panel adapted to Serverless:
  - developer authorization
  - ZIP/JSON import with confirmation
  - ZIP export
  - database diagnostics
  - aggregate and paged user statistics
  - page snapshots + restore drill
  - showcase-channel cache refresh
  - callback actions edit the existing developer-panel message instead of creating another panel
- developer-only `/app` shortcut to the named Mini App (`editor`)
- Serverless-side `RCB1` B2B Mini App bridge receiver for the private bridge group, including page list/read/create/save/delete, destinations, publish and native user-picker flows, JSON document transfer, target/protocol checks, numeric bot pairing, request-id deduplication, global + per-user throttling, optimistic revision conflicts, shared button validation, and error-log integration

The active Telegram Serverless and Cloudflare Mini App paths are JavaScript. Python still present under `app/` is legacy/reference material from the pre-Serverless implementation and is not part of the current deployment paths; Python tests remain reference material.

Deliberate scope exceptions:

- The current Pages rich-table redesign from `main` is already ported to Serverless: four saved pages per screen, rich table rows with delete/rename/copy/open actions, search, sort, pagination, delete/restore, and in-place management-message refresh. Do not describe this redesign as deferred or missing. Keep `main` as the behavioral reference for future Pages changes.
- Localization for the current Serverless bot scope is migrated. Keep `lib/lang/*.js` split per locale; do not recreate one monolithic localization bundle.
- Telegram Serverless deploys update handlers/modules/database code only; the Mini App frontend still requires separate HTTPS hosting. Cloudflare is frontend/relay only. Telegram Serverless is authoritative for pages, managed publish destinations and native user-picker state.
- Cloudflare D1 is correlation-only: `miniapp_bridge_pending` + `miniapp_bridge_identity`. Do not add `rich_pages`, `managed_chats`, popup/page bodies or user-picker mutation state back to D1.
- The bridge group is private and observable by the developer. Serverless accepts bridge commands only in chat `-1003993506865` from `@Richminiappsbot`, addressed explicitly to `@RichCustomizebot`, using protocol `RCB1`. Numeric relay pairing is permitted only via the initial PING. PUBLISH and USER_PICKER are side-effecting operations and must never be stale-retried.

## Data migration rules

- Keep existing `page_id` and `owner_id`.
- Import/retention never deletes old pages because an owner is above 12 pages.
- The 12-page limit applies only when creating a new page. Existing pages remain editable.
- Legacy JSON payloads remain in `legacy_states` for compatibility, but converted namespaces must also hydrate their live Serverless tables. In particular, `managed_chats.json` imports into `managed_chats` and `managed_publish_panels`; popup, Guest and page-navigation state is restored lazily by its converted subsystem. `rich_media.json` is legacy metadata only because saved blocks already retain Telegram `file_id` values.
- Import is validated and rerunnable. A page snapshot is created before applying an import. Do not describe the multi-table Serverless import as one cross-table transaction.
- Developer access is intentionally closed until numeric Telegram IDs are entered in `lib/developer-access.js`.

## Localization maintenance

Keep `main` as the behavior/source-text reference and preserve user-authored/imported content verbatim. Semantic UI uses `t(locale, key)`; historical source-copy compatibility uses `tr(locale, source)`. Shared key ordering lives in `lib/i18n-keys.js`, locale values live under `lib/lang/`, source-copy compatibility lives in `lib/i18n-source.js`, and bot profile copy lives in `lib/bot-profiles.js`.

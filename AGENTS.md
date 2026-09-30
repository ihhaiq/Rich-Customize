# AGENTS.md — Rich Customize Serverless

This branch is the active JavaScript implementation of Rich Customize.

The Python/Aiogram migration is complete. Work on this branch must target Telegram Serverless + Cloudflare Mini App only.

## Authoritative references

Use:

1. https://core.telegram.org/bots/serverless
2. https://core.telegram.org/bots/api

Do not reintroduce Railway/PostgreSQL/Redis/Aiogram architecture into this branch.

## Runtime layout

Telegram Serverless:

- `schema.js`
- `handlers/*.js`
- `lib/**/*.js`

Mini App frontend:

- `app/miniapp_static/**`

Cloudflare Pages Functions:

- `functions/**`

Cloudflare support SQL:

- `cloudflare/d1/schema.sql`
- `cloudflare/d1/cleanup-legacy.sql`

## Serverless rules

- isolated V8 runtime
- bare runtime imports only: `sdk`, `sdk/db`, `schema`, `lib/...`
- no filesystem access
- no npm dependency resolution inside handlers
- Bot API calls use `api.<method>({...})`
- await all DB calls
- schema changes belong in root `schema.js`
- `tgcloud push` deploys code; `tgcloud migrate` applies DB schema changes
- never commit credentials, tokens, `.tgcloud/` or `node_modules/`

## Source-of-truth boundaries

Telegram Serverless is authoritative for:

- `rich_pages`
- editor/session state
- managed publish destinations
- publish permission checks
- native user-picker state
- usage stats
- error-log configuration
- compatibility state required by published messages/imports

Cloudflare D1 is transient only:

- `miniapp_bridge_pending`
- `miniapp_bridge_identity`

Never add page bodies, managed chats, popup bodies, user-picker page mutations, or a parallel page database to D1.

The D1 binding name is exactly `DB`. Bridge tables auto-initialize when the binding exists.

## RCB1 bridge

Expected bridge:

- relay bot: `@Richminiappsbot`
- main bot: `@RichCustomizebot`
- bridge chat: `-1003993506865`
- protocol: `RCB1`

Commands:

```text
rcb_ping
rcb_pages
rcb_page
rcb_create
rcb_save
rcb_delete
rcb_destinations
rcb_publish
rcb_user_picker
rcb_err
```

Serverless temporarily accepts `rcb_client_error` as a legacy alias.

Rules:

- accept bridge commands only from the configured private bridge chat
- require bot sender + expected relay username
- require exact command target `@RichCustomizebot`
- pair numeric relay ID only through initial PING
- preserve request deduplication and rate limits
- SAVE/DELETE require revision tokens
- PUBLISH and USER_PICKER must not be stale-retried
- client error reports must not include page content, tokens or initData
- Bot-to-Bot Communication Mode must be enabled for bridge delivery

## Mini App rules

- verify Telegram `initData` before enabling the editor
- fetch the user's saved pages on every startup
- keep the editor blocked until startup succeeds
- do not autosave; explicit Save is authoritative
- preserve resume behavior for native Telegram pickers
- startup failure uses the blocking X state: `صار حادث` / `حاول فدشوية`
- API/client failures report through `/miniapp/api/client-error` and `rcb_err`
- avoid heavy blur/glow; keep the UI restrained and native-like

## Publishing rules

- never call `sendRichMessage` with an empty block list
- stale publish panels must fail before send
- telemetry/logging failures must never convert a successful Telegram publish into a failed publish result
- user-picker completion must remain retry-safe

## Localization

Supported locales:

`ar`, `en`, `es`, `de`, `it`, `pt`, `nl`, `pl`, `uk`, `ru`, `tr`, `ur`, `hi`, `id`, `ja`, `ko`, `vi`, `th`, `zh-hans`, `zh-hant`.

Removed: `fr`, `fa`, `ku`, `he`.

Keep locale catalogs split under `lib/lang/`. Developer panel is Arabic-only.

## Developer access

Developer IDs live in `lib/developer-access.js`.

Do not overwrite or remove configured local developer IDs during cleanup or deploy preparation.

## Cleanup phase

Current work is cleanup/stabilization before new feature development.

Cleanup policy:

- remove obsolete Python files whose behavior is already replaced by active JavaScript
- `app/miniapp_static/` is active and must stay
- do not delete compatibility tables/data simply because old Python files are removed
- do not remove uncertain files without a separate audit
- after every deletion batch, verify active JS imports and deployment paths
- do not start unrelated feature work during cleanup unless explicitly requested

The obsolete `app/**/*.py` implementation is not part of the active deployment and is scheduled for removal in this cleanup phase.

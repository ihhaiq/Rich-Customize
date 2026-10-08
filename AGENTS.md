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

Developer usage exemptions must use `isDeveloper` with a trusted Telegram user ID.
Pass the authenticated actor to content validators and the stored page owner to
saved-page rendering (including inline/guest navigation). Never trust a client
`is_developer`, `user_id`, or limits override to grant the exemption.

Developers bypass product quotas for blocks, visible text, table size, slideshow
item count, saved pages, premium emoji packs and per-user request windows across
editing, saving, previewing, publishing and syncing. Keep authentication,
ownership/revision checks, deduplication, mutation locks, global bridge backpressure,
transport-size bounds and Telegram API limits intact. Frontend checks are advisory;
Cloudflare and Serverless must independently enforce the same owner policy.

This branch currently has no scheduled-publishing implementation or scheduled-post
quota. Any future scheduler must apply the same developer exemption to its product
horizon/count quotas without bypassing Telegram's scheduling constraints.

## Cleanup phase

Current work is cleanup/stabilization before new feature development.

Cleanup policy:

- remove obsolete Python files whose behavior is already replaced by active JavaScript
- `app/miniapp_static/` is active and must stay
- do not delete compatibility tables/data simply because old Python files are removed
- do not remove uncertain files without a separate audit
- after every deletion batch, verify active JS imports and deployment paths
- do not start unrelated feature work during cleanup unless explicitly requested

The obsolete `app/**/*.py` implementation has been removed. Do not recreate Python runtime files in this branch.

## A1 subscription quota migration (October 2026)

Read [sups.md](sups.md) and [docs/subscription-rollout.md](docs/subscription-rollout.md) before changing subscription limits.
**Implemented/staged on serverless-cleanup, not automatically deployed to tgcloud:**

- Text quota policy: free 20,000, Plus 25,000, Golden 32,000 visible UTF-16 units, using `tgcloud/lib/subscription-policy.js`. Plus/Golden remain **not purchasable or active** until a verified payment-backed entitlement source exists; no client-supplied plan is trusted. Developer is exempt only when `isDeveloper(authenticatedTelegramUserId)` is true.
- Preserve existing page content above the free ceiling: an authorized UPDATE may retain or **decrease** its actual stored character count, but cannot increase it. Never grant this exemption to CREATE or arbitrary unsaved payloads. The baseline is trusted `rich_pages.blocks` or a verified owner-specific mirror (read is advisory); Serverless always rechecks before mutation. Unsaved direct publishing has no grandfather exception. Existing saved-page delivery is allowed to render already stored content.
- `functions/_lib/pages.js` is a Cloudflare **gateway** validator. For a PUT when its mirror is unavailable/stale, it can pass a legacy payload <=25k to the bridge, **not grant approval**. Serverless `tgcloud/lib/miniapp-bridge.js` must validate against actual saved blocks after ownership/revision checks. Never trust `previousBlocks`, `relayLegacyUpdate`, `plan`, or a developer flag from HTTP/RCB1 JSON.
- Counts should agree across `tgcloud/lib/editor-blocks.js` and `functions/_lib/pages.js`, including nested details/lists, native blocks, table cells and rich content. Do not include system branding/footer in the **user content** quota; do separately respect Telegram message-size limits.
- Free custom emoji pack quota is **2** (Plus 8/Golden 50 are policy only). Current Mini App packs are persisted in **Cloudflare D1**: `miniapp_custom_emoji_packs` and a legacy `miniapp_custom_emoji_primary_pack`; migration backfills legacy records without dropping either table. Nondeveloper pack insertion must use a single conditional atomic SQLite write. Do **not** mistake this transitional D1 storage for a paid-entitlement authority or silently migrate/delete user packs. Future move to Serverless requires its own approved migration.
- Existing unapproved numeric caps (pages, blocks, tables, slideshow) remain unchanged. Preserve saved over-limit content and snapshots; ensure downgrades never delete/clip stored material.
- For local verification use `node --experimental-vm-modules --test tests/serverless/subscription-policy.test.mjs tests/serverless/a1-quotas.test.mjs tests/serverless/developer-limits.test.mjs tests/serverless/a1-emoji-packs.test.mjs`. Full suite is recommended when available. Do not claim tests ran unless actually run.
- Never merge `main`, or issue `tgcloud push`, `tgcloud migrate`, or Cloudflare deployment without explicit approval. Documentation/changes here are source only. Use the `[CF-Pages-Skip]` commit prefix if Cloudflare must not auto-deploy this unfinished staged feature.

## A1 test evidence and CI caveat (2026-10-09)

- Keep `.github/workflows/a1-quota-tests.yml` as the focused no-deployment A1 CI job (four test files).
- First run https://github.com/ihhaiq/Rich-Customize/actions/runs/37844480265 reported failure **without executing steps**, runner duration 0 ms. Investigate GitHub Actions runner/permissions/annotations rather than interpreting this as a Node test failure.
- A separate isolated JS/V8 test executed 20 policy assertions against `tgcloud/lib/subscription-policy.js` and the three A1 emoji-pack test functions with their mocked D1: all passed. **These are not Node test-suite results, not real SQLite/D1 concurrency tests, and not production acceptance.**
- The next agent must rerun `node --experimental-vm-modules --test tests/serverless/subscription-policy.test.mjs tests/serverless/a1-quotas.test.mjs tests/serverless/developer-limits.test.mjs tests/serverless/a1-emoji-packs.test.mjs` on an available runner/local checkout before claiming A1 tests complete.
- Never deploy `tgcloud`, Cloudflare or `main` as a side effect of A1 test or documentation changes. Use `[CF-Pages-Skip]` on commits to the Cloudflare production branch until deployment is explicitly approved.

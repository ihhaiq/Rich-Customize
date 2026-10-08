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
- `functions/_lib/pages.js` is the Cloudflare **gateway** validator. The `PUT` route fetches an owner-scoped mirror via `functions/_lib/quota-baseline.js`; the mirror revision or updated_at MUST match the client's base revision. Missing, stale or mismatched mirrors **fail closed at free 20k**. Do not forward 20k–25k updates on trust that an older deployed Serverless will check the quota. The authoritative `tgcloud/lib/miniapp-bridge.js` still rechecks against stored blocks after ownership/revision checks. Never trust `previousBlocks`, `plan` or a developer flag from HTTP/RCB1 JSON.
- Counts should agree across `tgcloud/lib/editor-blocks.js` and `functions/_lib/pages.js`, including nested details/lists, native blocks, table cells and rich content. Do not include system branding/footer in the **user content** quota; do separately respect Telegram message-size limits.
- Free custom emoji pack quota is **2** (Plus 8/Golden 50 are policy only). Current Mini App packs are persisted in **Cloudflare D1**: `miniapp_custom_emoji_packs` and a legacy `miniapp_custom_emoji_primary_pack`; migration backfills legacy records without dropping either table. Nondeveloper pack insertion must use a single conditional atomic SQLite write. Do **not** mistake this transitional D1 storage for a paid-entitlement authority or silently migrate/delete user packs. Future move to Serverless requires its own approved migration.
- Existing unapproved numeric caps (pages, blocks, tables, slideshow) remain unchanged. Preserve saved over-limit content and snapshots; ensure downgrades never delete/clip stored material.
- For local verification use `node --experimental-vm-modules --test tests/serverless/subscription-policy.test.mjs tests/serverless/a1-quotas.test.mjs tests/serverless/a1-integration.test.mjs tests/serverless/developer-limits.test.mjs tests/serverless/a1-emoji-packs.test.mjs`. Full suite is recommended when available. Do not claim tests ran unless actually run.
- The user explicitly authorized **automatic Cloudflare Pages deployment for every update** on production branch `serverless-cleanup`. Do NOT add `[CF-Pages-Skip]` to new commit messages unless the user reverses this direction. Cloudflare must remain Mini App-only, with GitHub push triggering build; verify deployment state separately. Never merge `main` or issue `tgcloud push`, `tgcloud migrate`, `tgcloud webhook sync` without explicit authorization; Telegram Serverless stays on the existing version until the user can publish later.

## A1 test evidence and CI caveat (2026-10-09)

- Keep `.github/workflows/a1-quota-tests.yml` as the focused no-deployment A1 CI job (five test files including `a1-integration.test.mjs`).
- First run https://github.com/ihhaiq/Rich-Customize/actions/runs/37844480265 reported failure **without executing steps**, runner duration 0 ms. Investigate GitHub Actions runner/permissions/annotations rather than interpreting this as a Node test failure.
- A separate isolated JS/V8 test executed 20 policy assertions against `tgcloud/lib/subscription-policy.js` and the three A1 emoji-pack test functions with their mocked D1: all passed. **These are not Node test-suite results, not real SQLite/D1 concurrency tests, and not production acceptance.**
- The next agent must rerun `node --experimental-vm-modules --test tests/serverless/subscription-policy.test.mjs tests/serverless/a1-quotas.test.mjs tests/serverless/a1-integration.test.mjs tests/serverless/developer-limits.test.mjs tests/serverless/a1-emoji-packs.test.mjs` on an available runner/local checkout before claiming A1 tests complete.
- Cloudflare Pages **is approved for auto-deploy** from `serverless-cleanup` even for documentation/tests. Telegram Serverless and `main` are NOT approved for deploy/change. A Cloudflare deploy does not mean the new tgcloud renderer/bridge code is live.

## A1 concurrency/integration review (2026-10-09)

- `tgcloud/lib/editor-extra-blocks.js` must obtain any old-text quota allowance via `trustedEditorQuotaBaseline(userId, session)` in `editor-session.js`; NEVER pass unsaved `session.blocks` as its own old-content proof. The helper verifies actual stored `rich_pages` owner.
- Manual bot page saves and automatic page synchronization now use revision/owner-scoped conditional UPDATE, rejecting mid-flight conflicting writes instead of overwriting them. The Mini App bridge already uses revision CAS. Cross-session stale **editor session opened before an external edit** still needs separate revision tracking to fully detect all conflicts; do not claim otherwise.
- Cloudflare gateway legacy `PUT` can allow unchanged/reduced over-quota text only when the owner-scoped D1 page mirror matches the submitted base revision/updated_at; if mirror is absent/stale, new quota applies. Never relax create/direct publish.
- Tests `tests/serverless/a1-integration.test.mjs` cover mirror matching, untrusted drafts, saved-page delivery and CAS source invariants. GitHub Actions runner availability and end-to-end Telegram B2B+Cloudflare D1 still require verification; do not claim a live cross-platform pass until `tgcloud` is deployed.

## Subscription limit offers in the Mini App (2026-10-09)

- Cloudflare-only informational UI: `app/miniapp_static/subscription_offers.js` and `subscription_offers.css`, loaded by `editor.html` before `app.js` and `apple_emoji_picker.js`.
- On a verified quota error from the API/bridge (`editor limit exceeded: characters`, `EDITOR_LIMIT_CHARACTERS`, `PAGE_LIMIT`, blocks/tables, or `custom_emoji_pack_limit`), call `window.RichSubscriptionOffers.showForError(error)` or `.show('emojiPacks', {actual,limit})` when the add-pack tab is locked. Do not upsell on unrelated validation, connectivity or server errors.
- Show only **approved plan differences**: visible text Free 20,000 / Plus 25,000 / Golden 32,000; emoji packs 2 / 8 / 50. Other quota extensions and pricing are **not approved**, so generic limit dialogs must explicitly avoid promising an upgrade fixes them.
- CTA is a Telegram **deep link**, not an invoice: `https://t.me/richDonateBot?start=rich_plans_text`, `rich_plans_emoji`, or `rich_plans_limits` (all Telegram-safe payloads). `@richDonateBot` must independently implement these `/start` parameters when managed-bot support is available. For now, the UI tells users paid plans are in preparation. Do not fabricate Stars prices, pretend payment occurred or claim the bot recognizes the payload yet.
- Keep the locked emoji-pack add tab tappable so users can inspect plan comparison. Developers with unlimited quota should never see the pack-limit offer unless the trusted server returns a true limit error.
- UI copy is Arabic and English with English fallback for other supported locales until translations are supplied. Preserve Telegram initData gating; no billing code, tokens, or Cloudflare bot backend.
- Test entry: `node --test tests/serverless/subscription-offers.test.mjs`. Cloudflare Pages auto-deploy is authorized from `serverless-cleanup`, **tgcloud deployment remains deferred**.

## Plan roadmap presentation (2026-10-09)

- User requested all benefits from `sups.md` be visible in the Mini App offer comparison. `subscription_offers.js` now lists saved pages (12/50/150), blocks (30/60/120), branding removal, templates, per-page version history (suggested 5/20), and early access; each unapproved Plus/Golden perk is explicitly tagged `Proposed`/`مقترح`.
- The approval boundary does not change: **only text quotas 20k/25k/32k and emoji packs 2/8/50 have approved plan figures**; pricing and all other proposed paid benefits require a separate decision, implementation and verified billing. Do not add entitlement access from marketing markup. Do not imply saved templates or history exist before implementing them in Telegram Serverless.
- Free currently supports 12 saved pages, 30 blocks, and separate 99 Stars branding removal (subject to its existing entitlement); proposals for paid tiers cannot silently modify these limits. Keep the display updated when `sups.md` decisions change.

## Approved editor subscription scope — templates removed (2026-10-09)

- The owner approved Free/Plus/Golden saved-page limits **12/50/150**, block limits **30/60/120**, monthly 30-day prices **0/150/350 Stars**, active-paid branding removal, page-version history **0/5/20 per page**, and Golden early-access entitlement. **Saved templates are excluded and must not be advertised or implemented.**
- `tgcloud/lib/subscription-policy.js` is the pure policy source. `tgcloud/lib/editor-subscriptions.js` reads `editor_subscriptions` from Telegram Serverless; a paid plan is active only when status=active, source=`richdonate:verified`, and expiry is in the future. Developer unlimited quota remains tied to the authenticated developer ID. **Never trust HTTP client plan, `is_developer`, current timestamp, source or Stripe/Stars metadata supplied by a browser.**
- `tgcloud/lib/page-version-history.js` and table `editor_page_versions` contain snapshots for meaningful saved edits. Source snapshots are stored only for active Plus/Golden or developer, bounded to 5/20/50 and keyed by owner/page/revision; existing snapshots are not destroyed on subscription expiry. Telegram `صفحاتي` now has a history control. Restoring requires owner+expected current revision and archives the outgoing version.
- Do not reuse `page_snapshots` (full backups), do not write paid history into Cloudflare D1. No destructive cleanup or schema migrations without review. `tgcloud push/migrate/webhook sync` remains deferred until the user has a computer.
- Brand-removal lifetime entitlement purchased for 99 Stars always overrides the included temporary plan benefit and must survive Plus/Golden expiry. Early-access policy grants eligibility only; don't invent or activate experimental features without a flag.
- `@richDonateBot` has **not** yet issued verified editor subscriptions; code includes a trusted read-only entitlement resolver, not the payment flow. Cloudflare Mini App still performs conservative Free quota gateway checks (20k/30 blocks) until authenticated entitlement transport is designed. Avoid representing paid limits as live.
- The Cloudflare subscription offer popup shows approved future plan features/prices, explicitly says purchasing is currently unavailable, and contains no saved template. Cloudflare production branch remains `serverless-cleanup`, auto-deploy without `[CF-Pages-Skip]`.

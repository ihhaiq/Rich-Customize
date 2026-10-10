# AGENTS.md — Rich Customize

Work on `serverless-cleanup`. Active editor runtime is Telegram Serverless JavaScript; Cloudflare hosts the Mini App bridge plus a separate ID-only Cron reminder Worker for scheduled posts, NOT the main bot.
Read [docs/README.md](docs/README.md), [sups.md](sups.md) and [docs/subscription-rollout.md](docs/subscription-rollout.md). Archived material is historical, never implementation authority.

## Layout and runtime
- `tgcloud/schema.js`: persistent schema.
- `tgcloud/handlers/*.js`: flat Telegram update handlers.
- `tgcloud/lib/**/*.js`: editor, renderer, page delivery, publishing, quotas, localization and compatibility.
- `app/miniapp_static/**`: active browser UI.
- `functions/**`, `cloudflare/d1/**`: Mini App authentication, bridge, upload, support and scheduled-reminder metadata (never post contents).
- `workers/schedule-reminders/**`: separate Cron-only Worker using existing D1 and B2B relay credentials.
- `tests/serverless/*.test.mjs`: active JS suite, `npm test` from root; Node 24.
- `docs/archive/**`: old plans and Python tests as text, not active runtime/tests.
- Billing is maintained in `ihhaiq/richDonate` on `main`; no active `subscription-bot/` project in this repository.

Use SDK `api`, `db`, `fetch`, `InputFile` in the isolated V8 runtime. No filesystem/npm runtime dependencies.
Prefer relative project imports ending in `.js`; existing `schema`/`lib/...` module-name imports are supported.
Await DB calls. Code deployment and schema migration are separate. Do not reintroduce Aiogram, Railway, PostgreSQL or Redis runtime.

## Data and authorization
Telegram Serverless owns `rich_pages`, editor sessions, publish destinations/permissions, user-picker state, usage, error configuration and compatibility.
D1 retains existing bridge correlation/identity, owner-scoped advisory page mirrors and transitional emoji packs. It must not become a second authoritative page database or billing store.
Binding is `DB`. Do not silently remove/migrate existing packs or mirrors.
Authenticate Telegram initData before UI access and on the server. No client owner/plan/developer flag can grant access.
Check owner and revision before page changes; preserve CAS, request deduplication, mutation locks and global backpressure.
Do not delete compatibility tables, old callbacks or imported state because their original Python implementation is gone.

## RCB1 Mini App bridge
Relay: `@Richminiappsbot`; main: `@RichCustomizebot`; private bridge chat: `-1003993506865`; protocol: `RCB1`.
Preserve exact bridge chat, target username and sender checks. Numeric relay identity is pinned via PING.
Bot-to-Bot Mode is required. Commands include ping/pages/page/create/save/delete/destinations/publish/user_picker/err.
Keep legacy `rcb_client_error` compatibility. SAVE/DELETE require revision tokens.
Never stale-retry PUBLISH or USER_PICKER. Errors must exclude tokens, initData, page contents and payment secrets.

## Editor and publication
Fetch user pages at every Mini App startup; block editing until startup succeeds.
Preserve native-picker resume and explicit Save; local drafts are not authoritative saved pages.
Startup failure retains the blocking X state and localized retry behavior.
Never send an empty rich message. Telemetry failure must not turn successful Telegram publication into a failed publish result.
Saved rendering uses authenticated stored owner and quota baseline, including inline/guest/page navigation.
Content sync must not overwrite a saved page's name with a stale session title.
Exact normalized own-page names can be called in inline/guest; duplicate names refuse selection. Shared page-code behavior is preserved.
Save/rename/restore and Mini App create/save reject normalized names used by another page of the same owner; updating the same page is allowed.
Owner mutation locks have leases; unit tests do not prove exactly-once or full production concurrency.

## Developer access and localization
IDs: `tgcloud/lib/developer-access.js`. Preserve configured local IDs.
Only `isDeveloper` on a trusted Telegram actor grants internal product quota exemptions.
Authentication, ownership, revision checks, deduplication, locks, transport bounds and Telegram API limits still apply.
Supported locales: ar/en/es/de/it/pt/nl/pl/uk/ru/tr/ur/hi/id/ja/ko/vi/th/zh-hans/zh-hant.
Removed locales: fr/fa/ku/he. Catalogs: `tgcloud/lib/lang/`; developer panel Arabic-only.
Arabic copy uses the owner's wording, including «تليكرام».

## Subscriptions: approved specification versus current runtime
Root `sups.md` is the approved product specification, dated 2026-10-10:
- Text: 20000/25000/32768.
- Total nested blocks/items: 50/200/500.
- Depth: 4/8/16; media per message: 10/25/50; columns per table: 8/12/20.
- Saved pages: 12/50/150; emoji packs: 2/8/50.
- Plus 150 Stars, Golden 350 per 30 days; manual renewal.
- Branding: separate permanent 99-Star purchase, or included while Plus/Golden is active.
- Golden early access has no named experimental features yet.

Do NOT claim these new numbers are enforced merely because they appear in docs/donation UI.
Editor runtime still has older caps; [rollout](docs/subscription-rollout.md) tracks remaining work.
`editor-subscriptions.js` accepts active unexpired records from `richdonate:verified`; complete trusted payment event issuance/ACK remains pending.
Templates and saved page history are cancelled. Scheduling code and editor UI are present but NOT deployed or live. The new `tgcloud/lib/scheduled-publish.js` stores message snapshots and consumes verified RCB1 reminders; `workers/schedule-reminders/` defines a separate Cloudflare Cron Worker. Cloudflare holds IDs/times only. See `docs/scheduling.md` for migration, secrets, tests and rollout. Do not deploy/migrate before production authorization. Free allows 2 destinations per scheduled post; Plus=5 and Golden=15 are provisional.
Operational `page_snapshots`, revision CAS and session undo/redo remain required.

Preserve old saved content over the free text cap without allowing expansion. Trusted baseline must come from owner-verified stored pages, never unsaved session blocks.
Cloudflare PUT may use a matching owner-specific mirror; missing/stale mirrors fail closed to Free.
Serverless independently rechecks. Unsaved direct publication has no grandfather exception.
Final Telegram message limits include branding/generated text/blocks. Developer cannot bypass Telegram limits.
Do not assume `String.length`, Unicode characters and UTF-8 byte counts are identical.
The branding button deep-links to `https://t.me/richDonateBot?start=cart_branding`; old paid receipts/branding rights must remain valid.
The welcome «بوتاتي» button is removed; legacy runtime/data were not deleted.

## Cleanup and change log
- Every completed code, test, schema, UI or documentation change updates root `log.md` in the same batch.
- Record date, change, reason, files, actual tests and GitHub versus deployment state. Never log secrets/private content.
- Root `log.md` is the only active change history. `PROJECT-LOG.md` is a pointer to its archived baseline.
- Remove/move only files proven obsolete; validate imports, links and tests. Keep uncertain runtime modules and SQL until a separate dependency/data audit.
- No unrelated feature work during cleanup. Do not change financial behavior just to tidy files.

## Deployment
User authorized Cloudflare Pages Git auto-deploy from `serverless-cleanup`; no `[CF-Pages-Skip]` unless reversed. Verify deployment separately.
User runs Telegram CLI locally; supplying commands or pushing GitHub does not prove Telegram deployment.
For this cleanup: no `tgcloud push`, `migrate`, webhook changes, production data cleanup or architecture change.
Review schema and diff before any separately authorized production action. Never commit `.tgcloud/`, tokens, `.env` or `node_modules/`.

# soon.md — Rich Customize: Telegram Serverless 0.2.0 Migration Plan

> **Status:** planned / not executed yet  
> **Target branch:** `serverless-cleanup`  
> **Audience:** coding agent working on Rich Customize  
> **Date pinned:** 2026-10-07  
> **Primary change being planned:** Telegram Serverless update announced 2026-10-06 (CLI 0.2.0, Mini App hosting, Serverless endpoints, `tgcloud.jsonc`, relative-path imports with `.js`, and the new `tgcloud/` module layout).

## 0. Read this before touching the repository

This file is an execution specification, not permission to perform a blind migration.

The current bot is live and contains persistent user pages and compatibility behavior for already-published Telegram messages. The migration must be incremental, observable, reversible, and data-safe.

**Do not delete Cloudflare, D1, RCB1, the relay bot, compatibility tables, or old callback handling merely because Telegram now offers native Mini App hosting/endpoints. Prove feature parity first.**

**Do not run destructive database cleanup. Do not rewrite or recreate `rich_pages`. Do not change page IDs. Do not break callback_data already embedded in published Telegram messages.**

Before implementation, re-read the current official Telegram Serverless documentation, especially the sections for the October 6, 2026 changes, CLI 0.2.0, upgrade, Mini App front-end hosting, endpoints, module system, database, and CLI. Platform behavior may have changed after this document was written.

Official references:
- https://core.telegram.org/bots/serverless
- https://core.telegram.org/bots/webapps
- https://blogfork.telegram.org/bots/serverless#october-6-2026
- https://blogfork.telegram.org/bots/serverless#mini-app-front-end
- https://blogfork.telegram.org/bots/serverless#endpoints
- https://blogfork.telegram.org/bots/serverless#the-module-system
- https://blogfork.telegram.org/bots/serverless#upgrade
- https://blogfork.telegram.org/bots/serverless#command-line-interface

If the docs disagree with this file, **stop, document the discrepancy, and follow the current official platform contract after getting approval for any architectural change.**

---

## 1. Project context you must understand

Rich Customize is `@RichCustomizebot`, a rich-message editor for Telegram. The active implementation on this branch is JavaScript on Telegram Serverless plus a Mini App currently hosted on Cloudflare Pages.

The old Python/Aiogram runtime has already been removed from this branch. Do not reintroduce it.

### Current Telegram Serverless layout (pre-0.2 migration)

At the time this plan was written the repository still uses the old layout:

```text
schema.js
handlers/
  callback_query.js
  channel_post.js
  edited_channel_post.js
  guest_message.js
  inline_query.js
  message.js
  my_chat_member.js
  pre_checkout_query.js
lib/
  ...
app/miniapp_static/
  index.html
  app.js
  live_preview.js
  premium/custom emoji UI
  editor modules
  CSS/assets
  ...
functions/
  _lib/
  internal/
  miniapp/
cloudflare/d1/
docs/
package.json
AGENTS.md
```

There is currently **no `tgcloud/` directory and no `tgcloud.jsonc`**.

`package.json` currently declares:

```json
"@tgcloud/cli": "^0.1.2"
```

and its scripts include `tgcloud status`, `push`, `run`, `migrate`, and `webhook`.

The current `AGENTS.md` and `docs/serverless.md` describe the old module contract (root `schema.js`, root `handlers/`, root `lib/`, and bare imports). Those documents must be corrected as part of the migration once the exact CLI 0.2.0 generated structure is verified.

### Current source-of-truth rule

Telegram Serverless is authoritative for persistent bot/application state, especially:

- `rich_pages` — saved rich pages. **This is the source of truth.**
- editor/session state.
- managed publish destinations.
- publish permission checks.
- native user-picker pending state.
- usage/operational stats.
- recovery snapshots.
- compatibility state for old published messages/imports.

Never silently move page authority to D1 or create an uncontrolled second page database.

### Current Cloudflare role

Cloudflare currently does more than static hosting. It provides:

- Mini App frontend hosting from `app/miniapp_static/`.
- Telegram `initData` verification.
- B2B relay plumbing through `@Richminiappsbot`.
- relay webhook handling.
- Mini App API routes.
- media forwarding/upload flows that obtain reusable Telegram `file_id` values.
- short-lived correlation/identity state in D1.
- existing bridge rate limiting, retry, deduplication and observability behavior.

Important current code includes:

```text
functions/_lib/b2b-bridge.js
functions/_lib/telegram-auth.js
functions/_lib/web-session.js
functions/_lib/page-mirror.js
functions/miniapp/api/...
```

Cloudflare D1 historically contains bridge/sync support state. Audit the actual current schema before assuming which tables are still active; documentation and implementation may have evolved at different times.

### RCB1 bridge

The existing bridge connects the Mini App relay bot and main bot:

- relay bot: `@Richminiappsbot`
- main bot: `@RichCustomizebot`
- bridge chat: `-1003993506865`
- protocol: `RCB1`

Existing operations include page list/read/create/save/delete, destinations, publish, user picker, error reporting and synchronization-related behavior.

Security/reliability properties currently include request IDs, deduplication, rate limits, identity checks, optimistic revision checks, expiry, and special handling for side-effecting operations.

Do not remove this path until equivalent native Endpoint flows are proven and rollback is available.

### Compatibility requirements

Already-published messages may contain old callback formats. Preserve compatibility such as:

```text
r:page:...
r:spage:...
r:cbd:...
r:cbds:...
```

Do not delete legacy state/tables simply because new code no longer creates those records. Existing messages in Telegram can continue invoking them.

---

## 2. What Telegram changed on 2026-10-06

The October 6, 2026 Telegram Serverless update announces:

1. **Mini App hosting**
   - Mini App front-end build output can be deployed with the bot.
   - Telegram serves it at `https://app<app_id>.tgcloud.ai/`.

2. **Serverless endpoints**
   - Mini Apps can call backend functions using `Telegram.WebApp.Serverless.call(...)`.
   - This may allow direct Mini App → Telegram Serverless communication for flows currently routed through Cloudflare/RCB1.

3. **CLI 0.2.0**
   - Existing projects created with the earlier CLI require review/upgrade.

4. **`tgcloud.jsonc`**
   - New project configuration file, including Mini App frontend/build configuration.

5. **Relative-path module imports**
   - Project modules can now be imported by relative path.
   - Include the `.js` extension.
   - Do not mass-rewrite imports until the exact 0.2.0 module rules and generated upgrade diff are confirmed.

6. **All Serverless modules live under `tgcloud/`**
   - Existing projects should run `npx tgcloud upgrade` once.
   - Treat the upgrade as a source-layout migration that must be inspected before deployment.

These capabilities create an opportunity to simplify the architecture, but **they do not prove that every Cloudflare function, upload flow, auth/session mechanism, or D1 use can be removed.**

---

## 3. Desired architecture

### Current conceptual path

```text
Telegram Mini App
      ↓ HTTPS
Cloudflare Pages / Functions
      ↓
Cloudflare auth/API/bridge
      ↓
@Richminiappsbot
      ↓ RCB1 / Bot-to-Bot
@RichCustomizebot on Telegram Serverless
      ↓
rich_pages + other authoritative Serverless tables

Cloudflare D1
      ↳ transient bridge/sync/identity/support state
```

### Target after proven migration

Aim for:

```text
Telegram-hosted Mini App
  https://app<app_id>.tgcloud.ai/
              ↓
Telegram.WebApp.Serverless.call(...)
              ↓
tgcloud endpoints
              ↓
Telegram Serverless business logic
              ↓
rich_pages / managed state / Bot API
```

Cloudflare should remain only for capabilities that are still genuinely required after measurement and parity testing.

The target is **not** “delete Cloudflare”. The target is “remove unnecessary hops while preserving all behavior, security, data integrity and rollback options.”

---

## 4. Expected repository shape after CLI 0.2.0 migration

This is a target concept, **not a license to invent paths unsupported by the CLI**. First inspect what `npx tgcloud upgrade` and the current docs require.

Expected direction:

```text
tgcloud/
  handlers/
    callback_query.js
    channel_post.js
    edited_channel_post.js
    guest_message.js
    inline_query.js
    message.js
    my_chat_member.js
    pre_checkout_query.js
  lib/
    ...
  schema.js
  <endpoint modules according to the official 0.2.0 convention>

app/miniapp_static/
  <frontend source/build input or output, depending on tgcloud.jsonc>

tgcloud.jsonc
package.json

functions/                 # KEEP during transition
cloudflare/d1/             # KEEP during transition
docs/
AGENTS.md
soon.md
```

Do not guess the endpoint directory/name/export signature. Read the current official endpoint documentation and let CLI 0.2.0 conventions determine it.

---

## 5. Phase 0 — freeze and baseline

Before changing layout:

- [ ] Confirm branch is `serverless-cleanup`.
- [ ] Ensure working tree is clean.
- [ ] Record current Git commit SHA.
- [ ] Record `npx tgcloud --version`.
- [ ] Record `npx tgcloud status`.
- [ ] Record deployed Telegram Serverless revision.
- [ ] Confirm webhook is in sync.
- [ ] Run the existing test suite.
- [ ] Capture the current `tgcloud diff`/schema state if supported.
- [ ] Confirm the production Mini App URL and Cloudflare deployment are healthy.
- [ ] Verify a real page can list/open/save/publish before migration.
- [ ] Verify custom emoji, media, rich buttons and native user picker before migration.
- [ ] Do not make DB changes merely to establish this baseline.
- [ ] Create a rollback Git ref/commit before the upgrade.

Baseline acceptance: we can distinguish a pre-existing bug from a migration regression.

---

## 6. Phase 1 — audit CLI 0.2.0 before running upgrade

The repository currently pins `@tgcloud/cli ^0.1.2`. Before changing it:

- [ ] Read CLI 0.2.0 release/current documentation.
- [ ] Determine whether `npx tgcloud upgrade` expects CLI 0.2.0 to be installed first.
- [ ] Determine exactly what `upgrade` modifies: module paths, imports, config, scripts, metadata, schema location, frontend config.
- [ ] Determine whether `upgrade` is idempotent and how it behaves if interrupted.
- [ ] Determine whether it touches deployed state or only local files.
- [ ] Determine whether it performs/requests a DB migration.
- [ ] Determine whether the local `.tgcloud/` metadata format changes.
- [ ] Check new/changed CLI commands and flags.
- [ ] Check Node.js version requirements.
- [ ] Check whether `tgcloud fetch`, `status`, `push`, `diff`, `migrate`, `webhook sync`, and `run` semantics changed.
- [ ] Check frontend build command/output rules and ignored files.
- [ ] Check hosting limits: file count, total build size, per-file size, MIME types, caching, SPA routing, headers, source maps.
- [ ] Check endpoint limits: request/response size, timeout/CPU, concurrency, serialization, auth/user context, rate limits, allowed SDKs/APIs.
- [ ] Check whether endpoints can call Bot API and DB in the same way as handlers.
- [ ] Check upload/binary support before planning media migration.
- [ ] Check whether endpoint invocation automatically authenticates the Telegram user and what identity fields are trustworthy.
- [ ] Check behavior when the Mini App is opened outside Telegram.
- [ ] Check compatibility/version requirements for `Telegram.WebApp.Serverless.call`.

If any of these are undocumented, treat them as unknowns and design a test; do not assume.

---

## 7. Phase 2 — run upgrade locally and inspect, do not deploy

After the baseline and CLI audit:

- [ ] Update the project CLI dependency to the exact supported 0.2.x policy.
- [ ] Commit the dependency-only change if useful for rollback clarity.
- [ ] Run `npx tgcloud upgrade` once.
- [ ] Immediately inspect `git status` and full `git diff`.
- [ ] Do **not** immediately run `push` or `migrate`.
- [ ] Confirm all expected Serverless modules moved under `tgcloud/`.
- [ ] Confirm no Cloudflare frontend/functions were accidentally moved/deleted.
- [ ] Confirm `rich_pages` schema is semantically unchanged unless an intentional migration exists.
- [ ] Confirm handler discovery still includes every existing update handler.
- [ ] Confirm import paths resolve under the new relative-path rules.
- [ ] Confirm imports include `.js` where required.
- [ ] Confirm no runtime-only bare import was incorrectly rewritten.
- [ ] Confirm `tgcloud.jsonc` was generated/created according to official schema.
- [ ] Validate `tgcloud.jsonc`; do not invent unsupported keys.
- [ ] Run static import checks/tests before any deployment.

### Import migration warning

The old project documentation says project code uses bare imports such as `lib/...`. The new announcement allows relative imports with `.js`.

Do not perform a blind regex replacement. For each import category distinguish:

- Telegram-provided runtime/SDK imports.
- project-local modules.
- schema import.
- any generated/virtual modules.

Only project-local imports that the new module system expects to be relative should be converted.

Circular dependencies that were previously hidden by module resolution can become visible after conversion. Test module loading.

---

## 8. Phase 3 — configure Telegram Mini App hosting without cutting over production

- [ ] Determine whether `app/miniapp_static/` is already valid build output or should remain source.
- [ ] Configure `tgcloud.jsonc` to point to the correct frontend build output exactly as documented.
- [ ] Ensure every JS/CSS/HTML/asset referenced by `index.html` is included.
- [ ] Audit absolute URLs and Cloudflare-specific paths.
- [ ] Audit `_redirects`: it is Cloudflare-specific and may not have meaning on tgcloud hosting.
- [ ] Audit SPA/deep-link/resume behavior.
- [ ] Audit query parameters and `tgWebAppStartParam`.
- [ ] Verify cache behavior does not leave users on mismatched HTML/JS versions.
- [ ] Verify Telegram WebApp JS loads before code that requires it.
- [ ] Verify RTL/localization assets.
- [ ] Verify custom/premium emoji assets and pack UI.
- [ ] Verify editor preview and table rendering.
- [ ] Verify media URLs.
- [ ] Verify CSP/CORS/origin assumptions.
- [ ] Verify the existing “opened outside Telegram” blocking behavior.
- [ ] Verify unsaved-change protection.
- [ ] Verify native-picker resume behavior from `resume_session.js`.

Deploy a test Telegram-hosted frontend first. Keep the production Cloudflare URL unchanged until parity is demonstrated.

---

## 9. Phase 4 — introduce ONE native Serverless endpoint

Do not migrate all APIs at once.

Choose a low-risk, read-only operation first, preferably something equivalent to “list my pages” or another bounded read.

- [ ] Implement one endpoint using the exact official endpoint API.
- [ ] Call it with `Telegram.WebApp.Serverless.call(...)`.
- [ ] Authenticate/authorize using only documented trusted context.
- [ ] Enforce ownership in Serverless even if the client sends a user/page ID.
- [ ] Apply existing request validation and limits.
- [ ] Return a bounded response.
- [ ] Add timeout/error mapping in the Mini App.
- [ ] Add observability identifying `SERVERLESS_ENDPOINT` as the source.
- [ ] Keep the old Cloudflare/RCB1 path available behind a controlled fallback/feature flag.
- [ ] Compare response semantics and latency.
- [ ] Test retry behavior and duplicate invocation behavior.

Do not use automatic fallback for a side-effecting operation unless idempotency is proven. A timeout does not mean the server did nothing.

---

## 10. Endpoint migration inventory

Audit every current Mini App API route and classify it as:

1. **Native endpoint candidate**
2. **Keep on Cloudflare**
3. **Needs experiment / platform limitation unknown**
4. **Obsolete only after native replacement is proven**

At minimum audit:

```text
functions/miniapp/api/pages/
functions/miniapp/api/send.js
functions/miniapp/api/session.js
functions/miniapp/api/destinations.js
functions/miniapp/api/custom-emoji/
functions/miniapp/api/media/
functions/miniapp/api/upload/
functions/miniapp/api/rich-buttons/user-picker.js
functions/miniapp/api/client-error.js
functions/miniapp/api/performance.js
functions/miniapp/api/bridge/
functions/internal/
```

For each route document:

- caller(s) in frontend.
- request shape.
- response shape.
- auth mechanism.
- persistent/transient data touched.
- Bot API side effects.
- retry/idempotency policy.
- size/latency requirements.
- Cloudflare-specific dependencies.
- native endpoint replacement feasibility.
- fallback strategy.
- deletion criteria.

---

## 11. Bridge and D1 retirement criteria

Do **not** delete `b2b-bridge.js`, RCB1, relay webhook code or D1 tables merely after one endpoint works.

RCB1 can only be retired after all required flows have native replacements and production soak testing succeeds.

Particular care:

- SAVE/DELETE use optimistic revision tokens.
- CREATE needs deterministic retry recovery.
- PUBLISH has external side effects and must not be stale-retried.
- USER_PICKER has Telegram-native side effects and revision-sensitive resume behavior.
- large page/list responses previously used Telegram JSON documents because transport limits mattered.
- bridge request IDs/deduplication/rate limiting currently protect the system.

For D1, first generate an actual table/use inventory. Do not rely solely on old docs. `functions/_lib/page-mirror.js` indicates synchronization/mirror logic has existed; determine whether it is currently active, transitional, or obsolete before deleting anything.

Destructive SQL such as `cloudflare/d1/cleanup-legacy.sql` is forbidden during initial migration.

---

## 12. Data integrity invariants

These are non-negotiable:

- `rich_pages` remains authoritative until an explicitly approved architecture says otherwise.
- Existing `page_id` values never change.
- Page owner IDs never change.
- Existing saved blocks/buttons remain readable.
- Existing Telegram `file_id` values remain usable.
- Existing callback_data continues to resolve.
- Explicit Save remains authoritative; do not accidentally introduce autosave.
- A failed endpoint call must not silently overwrite a newer revision.
- A retry must not double-publish or duplicate an external side effect.
- Backup/import compatibility remains intact.
- Developer access IDs are preserved.
- Error telemetry must never turn a successful publish into a failed publish result.
- Migration code must not log tokens, raw `initData`, page bodies, or private user content unnecessarily.

Before any schema migration, inspect `tgcloud diff`. Apply only understood changes.

---

## 13. Authentication and security review

The current Cloudflare path explicitly verifies Telegram `initData` using the bot token and has a signed web-session mechanism. Native Serverless endpoints may change which parts are necessary.

Do not simply remove auth code.

For the new endpoint model determine from official docs:

- how the caller identity is delivered.
- whether identity is cryptographically bound by Telegram.
- whether an endpoint can be called outside a Telegram Mini App.
- whether arbitrary `user_id` supplied by the client must be ignored.
- whether start parameters are trusted.
- origin/CORS behavior.
- replay protection.
- request-size limits.
- endpoint exposure/naming.
- rate limiting and abuse behavior.

Authorization must remain server-side. Never trust page ownership or developer status from frontend state.

The frontend must still fail closed when opened in an unsupported/unverified context.

---

## 14. Media/upload review

Do not assume `Serverless.call` is a replacement for the existing media upload path.

The current system has media forwarding behavior and Telegram `file_id` reuse. Before migration test:

- binary argument support.
- maximum request size.
- maximum response size.
- execution timeout.
- memory limits.
- Bot API upload support from endpoint context.
- progress UX.
- cancellation.
- large Telegram media behavior.
- existing 20 MB Bot API download-related constraints where relevant.

If native endpoints are inferior for uploads, keep the Cloudflare media route.

A hybrid architecture is acceptable.

---

## 15. Native user picker review

The existing picker flow is sensitive:

```text
Mini App
→ request preparation
→ Serverless validates owner/page/block/marker
→ short-lived picker request
→ @RichCustomizebot sends request_users keyboard
→ Telegram sends users_shared
→ Serverless conditionally updates rich_pages
→ bot sends resume link
→ Mini App reopens the exact page
```

`app/miniapp_static/resume_session.js` currently intercepts the Cloudflare user-picker fetch to remember the page.

If the request moves to `Serverless.call`, this interception must be redesigned deliberately. Otherwise resume can silently break even though the endpoint succeeds.

Preserve the rule that the page must be saved/clean and reject stale revisions.

---

## 16. Error handling and observability

Preserve the existing developer error-channel behavior.

Add/standardize source tags such as:

```text
BOT_HANDLER
MINIAPP
SERVERLESS_ENDPOINT
CLOUDFLARE_API
RCB1_BRIDGE
TGCloud_HOSTING
```

During migration collect enough metadata to diagnose:

- endpoint name/action.
- safe request ID.
- user ID where appropriate.
- page ID where appropriate.
- revision.
- error code/class.
- duration.
- transport path (native vs fallback).
- deployed revision/build version.

Never include bot tokens, secrets, raw initData, full page bodies or sensitive content.

Make client error reporting itself failure-tolerant and rate-limited.

---

## 17. Failure modes to anticipate

### CLI/layout
- `upgrade` moves files but leaves stale imports.
- mixed old/new module layouts cause duplicate or missing handler discovery.
- root `schema.js` and new schema path diverge.
- old `AGENTS.md` instructs future agents to undo the new layout.
- package lock/dependency resolution still uses CLI 0.1.x.
- `.tgcloud` local metadata becomes stale.
- `fetch` after upgrade overwrites local migration work.

### Database
- accidental `migrate` applies unintended schema changes.
- table recreation loses data/indices/defaults.
- old compatibility tables appear unused but are needed by published messages.
- dual-write/native+bridge paths race on revisions.
- mirror data is mistaken for source-of-truth data.

### Endpoints
- user identity is trusted from client payload instead of server context.
- endpoint retry duplicates CREATE/PUBLISH.
- timeout triggers fallback after the native operation actually succeeded.
- response-size limits break page lists or large pages.
- serialization changes rich block/button structures.
- rate limits differ from bridge assumptions.
- endpoint names/exports do not match platform discovery.

### Frontend hosting
- wrong build-output directory deploys incomplete files.
- Cloudflare `_redirects` behavior is lost.
- absolute `/miniapp/api/*` calls point to a host where those routes do not exist.
- cache mismatch loads old HTML with new JS or vice versa.
- deep links/resume URLs still point to `rich-customize.pages.dev`.
- BotFather Main Mini App URL remains on the old host during a partial cutover.
- Telegram-hosted origin breaks CSP/CORS/cookie assumptions.
- service worker/browser cache (if introduced) complicates rollback.

### Auth/session
- removing initData verification before understanding endpoint identity.
- cookie/session logic assumes Cloudflare origin.
- outside-Telegram access accidentally enables editor APIs.
- replay/stale initData rules change.

### Media/custom emoji
- binary payload exceeds endpoint limits.
- custom emoji pack requests hit different caching/rate limits.
- Telegram file retrieval/upload behavior differs in endpoint context.
- a frontend asset path breaks emoji previews.

### Picker/resume
- `resume_session.js` only watches `fetch`, so a native Serverless call is not remembered.
- page revision changes while picker is open.
- resume link points to old host.

### Rollback
- BotFather URL changed before old Cloudflare path is confirmed available.
- DB schema becomes incompatible with old deployed code.
- old bridge removed too early.
- deployment changes code and frontend simultaneously, making regression isolation difficult.

---

## 18. Migration strategy / feature flags

Prefer a staged transport adapter in the Mini App rather than scattered direct calls.

Conceptually:

```js
callBackend(action, payload)
  -> native Serverless endpoint when enabled for this action
  -> legacy Cloudflare/RCB1 path when explicitly safe/allowed
```

Do not implement this exact API blindly; adapt it to current code.

Feature flags should be per action, not one global “new backend” switch. This allows reads to migrate before writes.

For mutations:
- include idempotency/revision semantics.
- do not fallback after ambiguous timeout unless the operation is proven safe to repeat.
- surface a recoverable “check current state” flow instead.

---

## 19. Suggested migration order

1. Baseline + tests.
2. CLI 0.2.0 audit.
3. Local `tgcloud upgrade` and layout/import migration.
4. Update `AGENTS.md`, `docs/serverless.md`, package scripts and project docs to the verified 0.2 contract.
5. Deploy bot runtime with **no architecture removal** and smoke test.
6. Configure Telegram Mini App hosting.
7. Deploy frontend copy to `app<app_id>.tgcloud.ai` while Cloudflare remains production.
8. Fix hosting-only assumptions.
9. Implement one read-only endpoint.
10. Add per-action transport abstraction/flag.
11. Migrate page reads.
12. Migrate safe mutations with revision/idempotency tests.
13. Evaluate destinations/custom emoji/error/performance endpoints.
14. Evaluate media separately.
15. Evaluate native user picker separately.
16. Run production soak period with observability.
17. Inventory remaining Cloudflare/RCB1 dependencies.
18. Only then propose deletion/retirement in a separate reviewed change.

---

## 20. Required regression matrix

Before declaring migration complete test at least:

- [ ] `/start` and editor entry.
- [ ] private-chat-only editor restrictions.
- [ ] new draft.
- [ ] open saved page.
- [ ] list/search/sort/paginate saved pages.
- [ ] explicit Save.
- [ ] create/delete page.
- [ ] revision conflict behavior.
- [ ] preview.
- [ ] publish to private chat/group/channel as supported.
- [ ] silent/protected/status settings.
- [ ] scheduled publishing behavior currently supported.
- [ ] Details/Divider/Heading/List/Quote/Math/Author/Footer/Anchor/Table.
- [ ] rich buttons and inline buttons.
- [ ] URL/USER/callback_data/copy button targets.
- [ ] callback behavior on old published messages.
- [ ] custom/premium emoji pack open/search/select/insert/reorder.
- [ ] custom emoji at caret.
- [ ] recent emoji/wallet behavior.
- [ ] media upload and Telegram file reuse.
- [ ] table compact mode.
- [ ] RTL/LTR behavior.
- [ ] Mini App localization.
- [ ] unsaved-change warning/discard.
- [ ] native user picker + resume.
- [ ] Mini App outside Telegram fails closed.
- [ ] network failure/retry overlay.
- [ ] client error reporting.
- [ ] developer panel.
- [ ] usage stats.
- [ ] backup import/export compatibility.
- [ ] old callback aliases.
- [ ] error logging does not expose secrets/content.

Test both the old Cloudflare transport and each new native endpoint during the transition.

---

## 21. Deployment gates

### Gate A — CLI migration accepted
Pass only if:
- new layout matches official docs.
- imports resolve.
- tests pass.
- `tgcloud status/diff` are understood.
- no unintended DB diff.
- no Cloudflare deletion.

### Gate B — runtime deployment accepted
Pass only if:
- webhook works.
- core bot editor works.
- existing pages are intact.
- old published callbacks work.

### Gate C — Telegram-hosted frontend accepted
Pass only if:
- frontend parity is demonstrated on mobile Telegram.
- startup/auth/resume work.
- all assets load.
- no production URL cutover yet.

### Gate D — endpoint accepted
Pass only if:
- identity/authorization are correct.
- ownership is enforced server-side.
- error/timeout/retry behavior is defined.
- parity tests pass.
- observability exists.

### Gate E — Cloudflare retirement proposal
Only after all required actions have migrated and soaked. Retirement is a **separate decision**, not part of the initial upgrade.

---

## 22. Rollback plan

Always keep a known-good pre-0.2 Git commit/ref.

During early phases:
- keep Cloudflare Pages production deployment available.
- keep RCB1 and relay bot operational.
- avoid irreversible DB migrations.
- do not remove old code in the same commit that introduces the replacement.

If new runtime deployment fails:
1. stop migration.
2. inspect tgcloud/deployment logs and error channel.
3. if DB schema is unchanged/compatible, redeploy the known-good revision using the supported rollback/deploy method.
4. keep Mini App pointed at Cloudflare.

If Telegram-hosted frontend fails:
- leave/restore BotFather/Main Mini App URL to the known-good Cloudflare deployment.
- do not alter Serverless data.

If a native endpoint fails:
- disable that action's native feature flag.
- use legacy path only where fallback semantics are safe.
- for ambiguous mutation failures, reconcile state instead of repeating blindly.

---

## 23. Documentation changes required after implementation

Update these once behavior is verified:

- `AGENTS.md` — new `tgcloud/` layout, relative imports, endpoint rules, hosting rules.
- `docs/serverless.md` — CLI 0.2.0 architecture and endpoint contract.
- `docs/cloudflare-pages-miniapp.md` — mark which responsibilities remain and which moved.
- `README.md` — current deployment commands/architecture.
- `package.json` scripts/dependency.
- add endpoint-specific architecture/security notes if needed.

Do not leave contradictory docs that tell the next agent to use root modules/bare imports after migration.

---

## 24. Agent working rules

When executing this plan:

1. Inspect before editing.
2. Prefer small commits grouped by migration phase.
3. Never mix data-destructive cleanup with runtime migration.
4. Never “clean up” compatibility code without tracing callers and historical Telegram callback contracts.
5. Search the repository for every moved import/path before committing.
6. Search frontend for every `/miniapp/api/` caller before changing hosting.
7. Search for `rich-customize.pages.dev` and classify every occurrence before host cutover.
8. Search for `fetch(` interception/wrapping before replacing HTTP calls; resume/error instrumentation may depend on it.
9. Search for RCB1 command names before retiring bridge operations.
10. Keep `rich_pages` authoritative.
11. Keep page revisions/idempotency rules.
12. Preserve user-visible behavior unless a change is explicitly requested.
13. Report uncertainty rather than inventing undocumented Telegram behavior.
14. After each phase run tests and a focused smoke test.
15. Before any `push` or `migrate`, show the expected diff and explain it.

---

## 25. First execution checklist for the next agent

When the user says to begin this migration, do this first:

```text
[ ] Read soon.md completely.
[ ] Read current AGENTS.md.
[ ] Read current official Telegram Serverless 0.2.x docs.
[ ] Inspect current Git branch/status/HEAD.
[ ] Inspect package.json and installed/resolved tgcloud CLI version.
[ ] Run/record tgcloud status.
[ ] Run existing tests.
[ ] Inventory current root handlers/lib/schema.
[ ] Inventory Cloudflare functions and D1 schema.
[ ] Search all imports.
[ ] Search all /miniapp/api/ frontend callers.
[ ] Search all RCB1 callers/handlers.
[ ] Search hard-coded Mini App hostnames.
[ ] Create rollback point.
[ ] Only then update CLI/run tgcloud upgrade locally.
[ ] Review diff before any deployment.
```

---

## 26. Definition of done

This project is not “migrated to 0.2.0” merely because `tgcloud push` succeeds.

Done means:

- project uses the officially supported 0.2.x layout/config.
- Telegram Serverless bot runtime remains stable.
- `rich_pages` and compatibility data are intact.
- existing published messages still work.
- Telegram-hosted Mini App has production parity if adopted.
- native endpoints replace only the flows proven safe and equivalent.
- auth/ownership/rate-limit/idempotency guarantees are preserved.
- media and picker flows are explicitly validated, not assumed.
- obsolete Cloudflare/RCB1 components are removed only after a separate evidence-based audit.
- rollback remains documented.
- project documentation matches the actual architecture.

## Final principle

**Upgrade the platform first, simplify the architecture second.**

CLI 0.2.0 migration, Mini App hosting, and native endpoints are three related but separable changes. Keep them separable in commits and testing so a failure in one layer does not force a risky all-at-once rollback.

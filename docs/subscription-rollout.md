# Subscription rollout status — serverless-cleanup

Updated 2026-10-08. This is an **implementation ledger**, not a production or pricing announcement. Specifications: [sups.md](../sups.md); architecture blocker: [soon.md](../soon.md).

## A1 staged in source — pending local/production verification

- `tgcloud/lib/subscription-policy.js`: trusted entitlement semantics, Free/Plus/Golden text limits **20k/25k/32k** and emoji packs **2/8/50**. Plus/Golden numbers are approved quotas but **not an authorization** to bill or activate these tiers. Purchases remain unavailable.
- `tgcloud/lib/editor-blocks.js` and `functions/_lib/pages.js`: the free text ceiling now derives from policy, not duplicate hardcoded `25000`. Neither route grants plans from client JSON.
- For existing stored pages above 20k, `previousBlocks` is **trusted server-stored** page content. Updates may retain/reduce old size but not expand it; a new page/import/direct-unsaved publish cannot claim a legacy exemption.
- `tgcloud/lib/editor-pages.js`, `tgcloud/lib/editor-session.js`, and `tgcloud/lib/miniapp-bridge.js`: protect manual saves, automatic synchronization and authoritative Mini App SAVE. Verification is after fetching the actual owned record and checking concurrency.
- `functions/miniapp/api/pages/[page_id].js` uses `functions/_lib/quota-baseline.js`: a legacy PUT above 20k is accepted by the **gateway** only if its owner-scoped D1 page mirror matches the submitted page revision/updated_at; missing or stale mirrors fail closed at 20k. This remains a gateway precheck, with Telegram Serverless rechecking verified stored content after its later deployment. An old Serverless runtime could otherwise still permit 25k edits while Cloudflare has the new limits.
- Saved-page publish/delivery routes pass the authenticated, stored original as a compatibility baseline to the renderer. Unsaved direct-send does not. Mixed/new content must obey the new free limit.
- `functions/_lib/custom-emoji-packs.js`: free Mini App emoji-packs 1 → **2**, backfill old `miniapp_custom_emoji_primary_pack` into `miniapp_custom_emoji_packs` without destructive SQL, and atomic conditional INSERT for concurrency. `app/miniapp_static/apple_emoji_picker.js` default and cached-pack slicing updated for 2. Developer unlimited access still requires verified Telegram identity.
- `tests/serverless/a1-quotas.test.mjs`, `tests/serverless/a1-integration.test.mjs` and `tests/serverless/a1-emoji-packs.test.mjs` plus existing quota tests are staged. An earlier GitHub Actions run failed **before job steps**. Complete automated Node and end-to-end Telegram/Cloudflare suites are not yet verified.


## A1 first verification attempt — 2026-10-09

- Workflow: [`.github/workflows/a1-quota-tests.yml`](../.github/workflows/a1-quota-tests.yml), runs on branch `serverless-cleanup` without any deployment/secrets.
- [GitHub Actions run 37844480265](https://github.com/ihhaiq/Rich-Customize/actions/runs/37844480265): **failed before any job step** (`steps=[]`, runner billable duration `0 ms`). This is **not** a failed Node test result; inspect GitHub Actions configuration/runner access and job annotations before assuming a code defect.
- Isolated V8 checks (real policy module, evaluated without import syntax): **20/20 PASS**. Isolated emoji pack tests (the repository's three A1 test functions run against real pack module with mocked D1): **3/3 PASS**.
- This is **partial verification only**. Native Node test suite, authentic D1 concurrency/migration and Telegram Serverless integrations are **not verified**. Do not mark A1 done or proceed with paid entitlements on this basis alone. The user has separately approved Cloudflare Pages auto-deployment but NOT tgcloud.

## Important limitations before publishing

1. Cloudflare Mini App pack data currently reside in D1 for the active app, not the future Serverless entitlement database. Do not destroy, overwrite, or silently migrate live pack records. A2 must define the authoritative personal subscription store and a separate safe pack migration if necessary.
2. Existing unsaved direct content has no trusted legacy baseline. If a saved page above 20k is edited locally then sent directly, the strict new limit will block the unsaved payload; saving a reduction or sending the unchanged saved page remains supported. UX for grandfathered overage modifications needs a product decision.
3. Current paid tiers have no verified payment-backed entitlement; nothing in A1 may accept a `plan`, `active`, `developer` or `previousBlocks` field from an HTTP client to unlock paid features.
4. Do not claim parity until Node tests, full regression tests, Cloudflare D1 pack migration/concurrency tests and Telegram Serverless saved-page tests are run.
5. Native Telegram final rich-message byte limits, page footer and callback content remain platform constraints even for exempt developers.

## Still blocked on separate official Managed Bots answer

`@richDonateBot` is designated as the **official managed** payment bot under `@RichCustomizebot`, requiring the same Telegram Serverless project. Whether the manager's single deployment receives updates from all managed bots remains unverified. No Cloudflare billing runtime, customer BotFather token intake, or second deployment is authorized. See [soon.md](../soon.md).

## Local verification (no deployment)

```bash
node --experimental-vm-modules --test tests/serverless/subscription-policy.test.mjs tests/serverless/a1-quotas.test.mjs tests/serverless/a1-integration.test.mjs tests/serverless/developer-limits.test.mjs tests/serverless/a1-emoji-packs.test.mjs
node --experimental-vm-modules --test tests/serverless/*.test.mjs
```

Review any old tests expecting 25k for free; update them only when the new free quota is intended, not by concealing regression. The user has authorized **Cloudflare Pages auto-deploy** from `serverless-cleanup` (no skip prefix). No `tgcloud push`, `tgcloud migrate`, `main` merge, or destructive production D1 mutation without separate authorization.

## A1 review of bypass and overwrite risks (2026-10-09)

- **Fixed:** Untrusted unsaved draft blocks no longer grant a historical text quota exception during editing of Details/other extra blocks. `trustedEditorQuotaBaseline` reads only a page actually owned by the authenticated editor.
- **Fixed:** Manual saved-page updates and editor autosync protect owner/page/revision in the write itself, preventing a newer revision committed between read and write from being blindly overwritten.
- **Fixed for phased deployment:** Cloudflare PUT has no untrusted <=25k fallback. Owner-scoped D1 mirror must match base revision/time, otherwise the request is checked as fresh 20k content; this is important until Telegram Serverless is separately upgraded.
- **Covered by tests:** `a1-integration.test.mjs` (new-page and unsaved direct-send rejection, legacy read, owner scope, mirror mismatch, CAS source guard). These source/mock tests are not a live Telegram test.
- **Remaining risk:** a bot editor session already stale *before* a new save begins is not identified from a session-pinned page revision (not currently stored). A separate revision-in-session design/migration is needed to eliminate that last-write hazard. Do not silently overwrite externally modified pages and do not mark A1 closed until this is addressed or acceptance is explicitly scoped.
- **Deployment order:** Cloudflare auto-deploy now permitted; **no tgcloud production deployment** until the user can run/review it. Confirm Cloudflare build and read-only public assets, then run authenticated smoke tests once Serverless matches source. Do not claim a live integration pass from mock tests alone.

## Mini App upgrade information on limits (2026-10-09)

- Quota-limit API failures in the Mini App now open a dedicated modal instead of an error-only experience. The premium emoji pack lock also opens this modal when tapped.
- The offer presents the entire approved plan, including text, custom emoji packs, saved pages, blocks, history, branding, Golden early access and approved Stars prices. Technical table/media quota expansion is not a paid benefit.
- A link opens `https://t.me/richDonateBot?start=rich_plans_text` for text, `rich_plans_emoji` for custom emoji packs or `rich_plans_limits` for other caps. Telegram `openTelegramLink` is used in the Mini App; the URL is a fallback. These `/start` payloads are **a proposed future contract**, not a live payment integration.
- The copy discloses that paid plans/prices are not yet available. No paid plan is activated in browser state and no token/payment is processed by Cloudflare.
- `tests/serverless/subscription-offers.test.mjs` covers classification, UI comparison and deep-link payloads in a mocked DOM. Real Telegram UI and `@richDonateBot` payload handling remain unverified until Telegram Serverless can be deployed.

## Plan comparison expanded (2026-10-09)

- The plan modal lists owner-approved benefits: saved pages 12/50/150, blocks 30/60/120, active-plan branding removal in Plus/Golden, 0/5/20 history versions per saved page and Golden early access. Saved templates are canceled.
- Every item is a **plan benefit**, with no proposal labels or feature-level `on activation` badges. Prices are 0/150/350 Stars per 30 days, but purchases are not currently available. The separate permanent Free branding-removal purchase remains 99 Stars.
- Version history source code and Telegram-side tables are present, but the live Telegram deployment and migration are still pending. Templates are explicitly excluded and have no implementation.
- The modal remains scrollable, while its exit/link controls stay at its bottom. Cache version is `0.3.83`. No `tgcloud` deploy.

## Owner decision: remove templates, implement other plan benefits (2026-10-09)

Approved plan configuration is now Free/Plus/Golden: **20k/25k/32k text**, **2/8/50 emoji packs**, **12/50/150 pages**, **30/60/120 blocks**, **0/5/20 historical versions per saved page**, **0/150/350 Stars per 30 days**, included active-plan branding removal on Plus/Golden and Golden early-access eligibility. **Saved templates have been cancelled and are not included in the app.**

Implementation in source:
- Telegram-only `editor_subscriptions` and `editor_page_versions` schema tables. `lib/editor-subscriptions.js` reads an owner-verified active entitlement, rejects expired/inactive/untrusted sources. There is **no editor-subscription payment issuance yet**.
- Saved-page history generated for meaningful saved changes on manual editor save, auto-sync, Mini App RCB1 SAVE and rename, with ownership, history count, revision CAS checks and restoration entry through the `🕘` control in saved pages. Restore archives the outgoing version.
- Active Plus/Golden entitlement suppresses the branding footer while active; independently purchased permanent 99-Star removal remains after downgrade or expiry.
- Limits are read in Telegram Serverless paths from trusted subscription state. Cloudflare Mini App maintains strict Free gateway validation until a Serverless-authenticated account entitlement transport exists; never accept client-submitted plan tiers to bypass it.
- Golden early-access eligibility is exposed as a policy helper, but no experimental feature has been specifically designated.
- **Operational blockers:** No proof of full Node suite / Telegram integration; new Serverless tables require schema review/migration; `tgcloud` is deliberately not deployed; no payment flow or paid plans live. Cloudflare Pages is the only automatic deployment allowed.

## Final terminology for plan UI (2026-10-09)

All compared features are approved membership benefits. The Mini App must **not** display `مقترح`, `Proposed`, or a repeated `عند التفعيل` tag. Explain purchase unavailability separately once. New Serverless features still require migration and deployment; source code alone is not a live paid service.

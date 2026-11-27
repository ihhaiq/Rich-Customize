# Cloudflare API and bridge services for the Mini App

The active Mini App frontend is hosted on Telegram Cloud from
`app/miniapp_static/`; Cloudflare Pages is not its frontend host. This document
covers the supporting Cloudflare Pages Functions/API routes, bridge and D1.
Persistent bot/application state is owned by Telegram Serverless.

Cloudflare remains responsible for supporting services called by the
Telegram Cloud-hosted Mini App and legacy Cloudflare-origin routes:

- validating Telegram Mini App `initData`;
- relaying requests through `@Richminiappsbot`;
- receiving the relay-bot webhook;
- forwarding Mini App media uploads to Telegram to obtain reusable `file_id` values;
- storing short-lived B2B correlation/identity metadata.
- media upload and preview, performance telemetry, and first-time import of
  legacy custom-emoji pack names when requested by the Serverless-hosted app.
- the separate scheduled-reminder Worker and its D1 metadata.

Telegram Serverless remains authoritative for pages and managed chats. Serverless Mini App page CRUD reads and writes `rich_pages` directly; it no longer sends saved-page documents or mirror updates to Cloudflare. D1 may still contain older owner-specific page mirrors used by legacy Cloudflare quota checks, but Serverless no longer refreshes them.

## Architecture

The Telegram Cloud-hosted Mini App sends supported page CRUD directly to the
Telegram Serverless `miniapp` endpoint. Cloudflare API calls are separate
supporting/legacy services, not the Mini App's static hosting path.

```text
Telegram Cloud-hosted Mini App
  ├── page operations ──→ Telegram Serverless `miniapp` endpoint ──→ rich_pages
  └── legacy bridge calls → Cloudflare Pages Functions → @Richminiappsbot
                                                       → private bridge group
                                                       → @RichCustomizebot
```

Persistent page edits happen only after an explicit Save. Unsaved editor changes remain local in the WebView.

## Cloudflare D1

Bind the D1 database to Pages Functions with the exact binding name `DB`.

The single canonical schema is:

```text
cloudflare/d1/schema.sql
```

The original bridge schema creates:

- `miniapp_bridge_pending` — short-lived request correlation/status;
- `miniapp_bridge_identity` — pinned numeric main-bot identity.

It does **not** create:

- `rich_pages`;
- `managed_chats`;
- popup/page-body storage;
- user-picker page mutation state.

If an older D1 database already contains those deprecated tables, use `cloudflare/d1/cleanup-legacy.sql` only after verifying the Telegram Serverless cutover. The cleanup script is intentionally separate and destructive.

Page bodies, publish destinations and native user-picker state stay in Telegram Serverless.

## Mini App frontend hosting

The active static frontend source and Telegram Cloud deployment are:

```text
app/miniapp_static
tgcloud.jsonc
```

`npm run deploy` builds the frontend into `.tgcloud-miniapp-static/` and runs
`tgcloud push`. This deploys to Telegram Cloud, not Cloudflare Pages. Do not
configure `app/miniapp_static` as the production Mini App frontend output for
Cloudflare Pages.

Cloudflare Pages Git integration may deploy the supporting Functions/API
routes from `serverless-cleanup`; it does not publish the active Mini App UI.

## Cloudflare variables

Required:

```text
BOT_TOKEN=<@RichCustomizebot token; used for initData verification and Telegram media upload forwarding>
B2B_BOT_TOKEN=<token for @Richminiappsbot>
B2B_WEBHOOK_SECRET=<random 16-256 char A-Z/a-z/0-9/_/- secret>
SYNC_SECRET=<secret for the internal webhook-setup endpoint>
```

Optional hardening/overrides:

```text
B2B_BRIDGE_CHAT_ID=-1003993506865
B2B_TARGET_BOT_USERNAME=RichCustomizebot
B2B_MAIN_BOT_ID=<numeric main-bot id>
```

## Initial setup

1. Apply `cloudflare/d1/schema.sql`.
2. Deploy the supporting Cloudflare Pages Functions.
3. POST once to:

```text
/internal/setup-b2b-webhook
Authorization: Bearer <SYNC_SECRET>
```

That endpoint:

- verifies that `B2B_BOT_TOKEN` belongs to `@Richminiappsbot`;
- configures Telegram `setWebhook` to `/miniapp/api/bridge/webhook`;
- installs `B2B_WEBHOOK_SECRET` as Telegram's webhook secret;
- sends the mandatory `RCB1 PING` pairing request.

Serverless accepts numeric relay pairing only through that PING. Cloudflare pins the numeric main-bot ID from the first verified bridge response unless `B2B_MAIN_BOT_ID` is configured explicitly.

## RCB1 commands

```text
/rcb_ping@RichCustomizebot
/rcb_pages@RichCustomizebot
/rcb_page@RichCustomizebot
/rcb_create@RichCustomizebot
/rcb_save@RichCustomizebot
/rcb_delete@RichCustomizebot
/rcb_destinations@RichCustomizebot
/rcb_publish@RichCustomizebot
/rcb_user_picker@RichCustomizebot
```

Every request contains:

```json
{"protocol":"RCB1","request_id":"...","user_id":123456789}
```

Operations that address a saved page also include `page_id`. SAVE and DELETE require `base_updated_at`.

## Request/response flow

Cloudflare page/destination endpoints enqueue a Telegram B2B request and return HTTP `202` with `request_id`.

The Mini App then polls:

```text
/miniapp/api/bridge/<request_id>
```

while the blocking **«انتظر شوية…»** overlay keeps the editor inert.

Large reads such as page bodies, page lists and destination lists return as Telegram JSON documents. The Cloudflare webhook stores only the Telegram `file_id` and request status; the status endpoint downloads and validates the document on demand.

Small mutation results use ACK responses.

This relay flow is retained for legacy and supporting API routes. The
Telegram Cloud-hosted Mini App uses its direct `miniapp` endpoint for page CRUD.

## Source-of-truth rules

Telegram Serverless is authoritative for:

- `rich_pages`;
- `managed_chats`;
- publishing permission checks;
- user-picker pending state and `users_shared` handling;
- page ownership and revision checks.

Cloudflare must not treat its transitional page mirrors as authoritative page storage.

As of 2026-11-06, Serverless no longer enqueues or sends `PAGE_SYNC` page documents, and the `full_sync` bridge action is disabled. Existing D1 mirrors and outbox rows are left untouched; no migration or production cleanup is implied. Because old D1 mirrors can now be stale, legacy Cloudflare quota-baseline checks must continue to fail closed when a matching mirror is missing or outdated.

The old server-side discard rollback was removed after autosave was removed. The trash/close flow now discards only unsaved local WebView changes; an explicit Save is never silently undone.

## Security and reliability

Current safeguards include:

- verified Telegram `initData`;
- exact private bridge chat;
- exact relay username plus pinned numeric relay ID;
- exact target `@RichCustomizebot`;
- mandatory `RCB1` protocol;
- pinned numeric main-bot identity on webhook responses;
- global relay + per-user/per-action rate limits;
- request-ID deduplication;
- optimistic revisions for SAVE and DELETE;
- deterministic CREATE retry recovery;
- no stale retries for PUBLISH or USER_PICKER side effects;
- shared page/button validation on relay and Serverless boundaries;
- authoritative page-button ownership validation in Serverless;
- 2 MB B2B request/response document limits;
- immutable completed Cloudflare correlation rows;
- explicit request expiry;
- polling backoff and transient 502/503/504 retries;
- non-dismissible UI locking during asynchronous B2B work;
- editor remains locked if opened outside Telegram or if `initData` verification fails;
- Serverless error/security alert integration with the configured developer error channel.

## Native user picker

The Mini App user picker no longer mutates D1.

The page must already be saved and clean. The flow is:

```text
Mini App
  → RCB1 USER_PICKER
  → Serverless validates owner/page/block/marker
  → Serverless stores short-lived picker request
  → @RichCustomizebot sends request_users keyboard
  → Telegram sends users_shared
  → Serverless conditionally updates rich_pages
  → bot sends a resume link back to the same page
```

If the page revision changed while the picker was open, the selection is not applied.

## Deployment note

Telegram Serverless schema changes include both:

- `miniapp_bridge_requests`;
- `miniapp_user_picker_requests`.

Review/apply them with:

```bash
npx tgcloud diff
npx tgcloud migrate
npm run deploy
npx tgcloud webhook sync
```

Bot-to-Bot Communication Mode must be enabled for both bots before smoke testing.

## A1 phased rollout: Cloudflare before tgcloud (2026-10-09, historical)

The checks in this historical rollout section described the former
Cloudflare-origin frontend. The active Mini App frontend is now hosted by
Telegram Cloud; retain Cloudflare only for the API/bridge services described
above.

The production branch is `serverless-cleanup` and the owner has approved
**automatic Cloudflare Pages Functions deployment on branch commits**. This
applies to supporting API/bridge routes, not the Telegram Cloud frontend. Do
not use `[CF-Pages-Skip]` while this instruction remains in force. This does
not authorize `tgcloud push` or `tgcloud migrate`.

Until the new Telegram Serverless version is deployed, Cloudflare PUT for an existing page must not trust the older Serverless 25k quota. `functions/_lib/quota-baseline.js` only allows a 20k+ legacy page update if the owner-specific D1 mirror is present and its revision/updated_at matches the request base. A missing/stale mirror fails closed, preserving old content in storage but requiring the mirror to catch up before modifying >20k. CREATE and direct unsaved PUBLISH are always subject to 20k.

Historical deployment checks included Pages static-file availability.
Current checks should verify the Telegram Cloud frontend and test its
authenticated Serverless/API integrations separately. Unauthenticated HTTP
checks cannot prove owner quota enforcement or Telegram B2B delivery.

## Subscription quota presentation (2026-10-09)

`editor.html` loads `subscription_offers.js` and `subscription_offers.css`. Recognized text/emoji/page/block limit errors open the approved plan comparison. Paid page and block allowances are approved, but Cloudflare must continue to fail closed for nonverified entitlements until an authenticated Serverless bridge for paid plans is available. Table/media technical quotas are separate.

Each modal shows Free / Plus / Golden Ticket approved text+pack limits and a Telegram deep link to `@richDonateBot` with payload `rich_plans_text`, `rich_plans_emoji`, or `rich_plans_limits`. Payment is explicitly **not live**. Test the live link inside Telegram and confirm which bot receives `/start` after official managed-bot support is established; Cloudflare does not process the payment.

## Plan comparison without saved templates (2026-10-09)

The Mini App quota modal lists the approved post-launch plan comparison including pages, blocks, active-plan branding removal and Golden early access and 150/350-Star 30-day prices. Saved templates are omitted by user decision. No Stars invoice or paid plan activation is handled by Cloudflare.

These features remain source-staged until trusted Telegram Serverless subscriptions are enabled. The Cloudflare gateway must still use conservative Free validation while authenticated paid entitlements are unavailable on the gateway; the app does not claim Plus/Golden are available for purchase.

**Plan-label rule:** Owner-approved plan benefits must appear without `مقترح`, `Proposed`, or repeated `عند التفعيل` labels; one separate availability notice says paid subscriptions are not yet purchasable. Templates were canceled. Version `0.3.85` refreshes the plan modal assets.

## Subscription UI styling revision 2026-10-09
The subscription comparison is a pricing-first compact card layout: price (Stars/30 days) stands out beside plan name; approved entitlements are shown in one simple grid without separate headings for quotas and features. A single notice below the cards says plans are in beta and unavailable for sale. Deep links to `@richDonateBot` remain informational. No templates or billing activation from Cloudflare.

## Current documentation

The approved limits and canceled features are recorded in [sups.md](../sups.md). Saved-page version history and templates are canceled. Scheduled publishing is available and owner-confirmed in use; its Cloudflare Cron relay is documented in [scheduling.md](scheduling.md). [Subscription rollout](subscription-rollout.md) distinguishes approved benefits from enforced runtime limits. Earlier deployment notes above describe their dated rollout stage.

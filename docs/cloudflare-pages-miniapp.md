# Cloudflare deployment for the Mini App

The current architecture keeps persistent bot/application state in Telegram Serverless.

Cloudflare is responsible only for:

- hosting the Mini App frontend;
- validating Telegram Mini App `initData`;
- relaying requests through `@Richminiappsbot`;
- receiving the relay-bot webhook;
- forwarding Mini App media uploads to Telegram to obtain reusable `file_id` values;
- storing short-lived B2B correlation/identity metadata.

Cloudflare D1 is **not** a page database and is not a managed-chat database.

## Architecture

```text
Telegram Mini App
      ↓ HTTPS
Cloudflare Pages / Functions
      ↓
@Richminiappsbot
      ↓ Telegram Bot-to-Bot
private bridge group (-1003993506865)
      ↓
@RichCustomizebot / Telegram Serverless
      ↓
rich_pages + managed_chats + Mini App picker state
```

Persistent page edits happen only after an explicit Save. Unsaved editor changes remain local in the WebView.

## Cloudflare D1

Bind the D1 database to Pages Functions with the exact binding name `DB`.

The single canonical schema is:

```text
cloudflare/d1/schema.sql
```

It creates only:

- `miniapp_bridge_pending` — short-lived request correlation/status;
- `miniapp_bridge_identity` — pinned numeric main-bot identity.

It does **not** create:

- `rich_pages`;
- `managed_chats`;
- popup/page-body storage;
- user-picker page mutation state.

If an older D1 database already contains those deprecated tables, use `cloudflare/d1/cleanup-legacy.sql` only after verifying the Telegram Serverless cutover. The cleanup script is intentionally separate and destructive.

Page bodies, publish destinations and native user-picker state stay in Telegram Serverless.

## Frontend deployment

Static frontend:

```text
app/miniapp_static
```

Recommended Cloudflare Pages settings:

| Setting | Value |
| --- | --- |
| Production branch | `serverless-cleanup` |
| Framework preset | None |
| Root directory | leave empty |
| Build command | `exit 0` |
| Build output directory | `app/miniapp_static` |

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
2. Deploy Cloudflare Pages / Functions.
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

## Source-of-truth rules

Telegram Serverless is authoritative for:

- `rich_pages`;
- `managed_chats`;
- publishing permission checks;
- user-picker pending state and `users_shared` handling;
- page ownership and revision checks.

Cloudflare must never reconstruct a parallel copy of those tables.

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
npx tgcloud push
npx tgcloud migrate
npx tgcloud webhook sync
```

Bot-to-Bot Communication Mode must be enabled for both bots before smoke testing.

## A1 phased rollout: Cloudflare before tgcloud (2026-10-09)

The production branch is `serverless-cleanup` and the owner has approved **automatic Cloudflare deployment on branch commits**. Do not use `[CF-Pages-Skip]` while this instruction remains in force. This does not authorize `tgcloud push` or `tgcloud migrate`.

Until the new Telegram Serverless version is deployed, Cloudflare PUT for an existing page must not trust the older Serverless 25k quota. `functions/_lib/quota-baseline.js` only allows a 20k+ legacy page update if the owner-specific D1 mirror is present and its revision/updated_at matches the request base. A missing/stale mirror fails closed, preserving old content in storage but requiring the mirror to catch up before modifying >20k. CREATE and direct unsaved PUBLISH are always subject to 20k.

Deployment checks: confirm Pages deployment is successful; verify `/miniapp/static/editor.html` and `/miniapp/static/app.js` are accessible. Unauthenticated HTTP checks cannot prove owner quota enforcement or Telegram B2B delivery; those require authenticated real-user smoke tests after tgcloud is deployed.

## Subscription quota presentation (2026-10-09)

`editor.html` loads `subscription_offers.js` and `subscription_offers.css`. When saving text above 20k, `app.js` calls the offer UI for recognized quota errors only. When the Free plan's two custom emoji pack slots are full, the add-pack tab stays tappable and shows the same comparison modal. Other quota errors are informational, as page/block/table paid expansion is **not approved**.

Each modal shows Free / Plus / Golden Ticket approved text+pack limits and a Telegram deep link to `@richDonateBot` with payload `rich_plans_text`, `rich_plans_emoji`, or `rich_plans_limits`. Payment is explicitly **not live**. Test the live link inside Telegram and confirm which bot receives `/start` after official managed-bot support is established; Cloudflare does not process the payment.

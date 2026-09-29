# Cloudflare deployment for the Mini App

The current Mini App architecture keeps persistent page data in Telegram Serverless.

Cloudflare is used only for:

- the Mini App HTML/CSS/JavaScript frontend;
- the stateless HTTP relay for `@Richminiappsbot`;
- receiving the Mini App bot webhook and correlating short-lived request/response traffic.

Cloudflare D1 is **not** the production page store. Do not copy or migrate `rich_pages` to D1.

## Architecture

```text
Telegram Mini App
      ↓ HTTPS
Cloudflare Pages / Functions
      ↓
@Richminiappsbot
      ↓ Telegram Bot-to-Bot message/document
private bridge group (-1003993506865)
      ↓
@RichCustomizebot on Telegram Serverless
      ↓
rich_pages / Telegram Serverless DB
```

The Mini App edits a loaded page locally. Persistent writes happen only when the user presses Save.

## Frontend deployment

The static frontend remains deployable from:

```
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

The existing compatibility redirects may remain while the frontend is migrated to the B2B relay API.

## B2B bridge

Serverless implements protocol `RCB1` in `lib/miniapp-bridge.js`.

The bridge accepts only commands from `@Richminiappsbot` in:

```
-1003993506865
```

The first valid bridge message pins the Mini App bot numeric Telegram ID in Serverless state. Later bridge requests must come from the same numeric bot ID.

Supported Serverless commands:

```text
/rcb_ping@RichCustomizebot
/rcb_pages@RichCustomizebot
/rcb_page@RichCustomizebot
/rcb_create@RichCustomizebot
/rcb_save@RichCustomizebot
/rcb_delete@RichCustomizebot
```

Read requests use JSON metadata in the message text. Large page responses are returned as JSON documents.

Create and save requests carry the page payload as a JSON document. This avoids normal Telegram text-message length limits.

## Authentication boundary

The Cloudflare relay must validate Telegram Mini App `initData` before creating a bridge request.

The relay must derive `user_id` from validated Telegram data. It must never trust a `user_id` supplied by arbitrary browser JSON.

The Telegram Serverless side then applies the second trust boundary:

- exact bridge group;
- sender must be a Telegram bot;
- sender username must be `@Richminiappsbot`;
- sender numeric bot ID is pinned;
- page ownership is checked against `rich_pages.owner_id`.

## Request flow

List pages:

```text
Mini App
  → Cloudflare relay
  → /rcb_pages@RichCustomizebot + request metadata
  → Telegram Serverless reads rich_pages
  → pages_<request_id>.json
  → Cloudflare relay
  → Mini App
```

Open one page:

```text
Mini App
  → Cloudflare relay
  → /rcb_page@RichCustomizebot
  → Telegram Serverless reads the owned page
  → page_<page_id>_<request_id>.json
  → Cloudflare relay
  → Mini App
```

Save:

```text
Mini App edits locally
  → user presses Save
  → Cloudflare relay sends save JSON document
  → Telegram Serverless validates owner + limits + base_updated_at
  → UPDATE rich_pages
  → SAVE_PAGE_OK
  → Cloudflare relay
  → Mini App
```

`base_updated_at` is required for saves. If the page changed after it was loaded, Serverless returns `PAGE_CONFLICT` rather than overwriting the newer version.

## Reliability and observability

The Serverless bridge includes:

- short-lived persistent `request_id` deduplication;
- mutation response replay for completed create/save/delete requests;
- per-action rate limiting;
- a 2 MB bridge JSON document ceiling;
- existing editor resource-limit validation;
- owner checks for all page operations;
- the existing 12-page creation rule;
- error and security-alert integration with the developer-configured error-log channel.

The private bridge group is intentionally retained as a human-readable live trace of requests and replies.

## Deployment note

The bridge adds the `miniapp_bridge_requests` table, so Serverless deployment must include the schema migration:

```bash
npx tgcloud diff
npx tgcloud push
npx tgcloud migrate
npx tgcloud webhook sync
```

Bot-to-Bot Communication Mode must be enabled as required by Telegram for participating bots.

## Deprecated D1 plan

The previous plan used Cloudflare D1 as a second `rich_pages` store. That plan is no longer the target architecture.

Existing files under `cloudflare/d1/` and D1-oriented functions may remain temporarily as migration/reference material, but they must not receive production page writes while the B2B bridge is the active plan.

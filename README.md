# Rich Customize — Telegram Serverless

Branch: `serverless-cleanup`

Rich Customize now runs on Telegram Serverless JavaScript. The Python/Aiogram runtime has been fully replaced for this branch.

## Current architecture

### Telegram Serverless

Authoritative application state and bot behavior live in:

- `schema.js`
- `handlers/*.js`
- `lib/*.js`
- `lib/lang/*.js`

Telegram Serverless is the source of truth for:

- saved pages
- editor sessions
- managed publish destinations
- publish permissions
- user-picker state
- usage/operational state
- error-log configuration
- backup/import compatibility state

### Mini App / Cloudflare

The Mini App frontend lives in:

- `app/miniapp_static/`

Cloudflare Pages Functions live in:

- `functions/`

Cloudflare is limited to:

- hosting the Mini App
- validating Telegram `initData`
- relaying B2B requests through `@Richminiappsbot`
- receiving the relay webhook
- forwarding Mini App media uploads to Telegram
- keeping short-lived bridge correlation/identity state in D1

Cloudflare D1 must not store page bodies, saved-page CRUD state, managed chats, popup content, or page-mutation state.

The D1 binding name must be exactly:

```text
DB
```

The bridge schema auto-initializes at runtime when the `DB` binding exists. The canonical schema remains:

```text
cloudflare/d1/schema.sql
```

## B2B bridge

Protocol: `RCB1`

Bridge:

```text
Mini App
  ↓
Cloudflare
  ↓
@Richminiappsbot
  ↓
private bridge group
  ↓
@RichCustomizebot / Telegram Serverless
```

Configured bridge chat:

```text
-1003993506865
```

Current commands:

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
/rcb_err@RichCustomizebot
```

The legacy `/rcb_client_error` alias is accepted temporarily by Serverless for compatibility, but Cloudflare sends `/rcb_err`.

Bot-to-Bot Communication Mode must be enabled for the participating bots so bot-addressed bridge commands can be delivered inside the bridge group.

Bridge hardening includes:

- exact bridge chat restriction
- exact target bot username
- relay username check
- numeric relay pairing/pinning
- request ID validation and deduplication
- per-user/action and global throttling
- optimistic revision checks for SAVE/DELETE
- no stale retry for PUBLISH/USER_PICKER
- bounded JSON request/response sizes
- owner checks on page operations
- shared button validation
- client-error forwarding into the configured Serverless error-log channel

## Mini App behavior

On every startup:

1. Telegram `initData` is verified.
2. The Mini App requests the user's saved-page list from Serverless through B2B.
3. The editor remains locked until startup data is ready.
4. A resume target is restored when a Telegram-native picker previously closed the WebView.
5. Otherwise a new local draft is opened.

Edits remain local until explicit Save.

If startup fails, the blocking overlay stays visible and shows:

```text
صار حادث
حاول فدشوية
```

with an X instead of the loading spinner.

Client/API errors are reported through `/miniapp/api/client-error` → `/rcb_err` → Serverless `logError('miniapp.client', ...)`. Reports are sanitized, deduplicated and throttled; page contents, bot tokens and Telegram `initData` are not included.

## Publishing

Publishing refuses to continue when the current editor session contains no blocks. This prevents stale publish panels from reaching `sendRichMessage` with an empty rich message.

## Localization

Supported user-facing locales:

`ar`, `en`, `es`, `de`, `it`, `pt`, `nl`, `pl`, `uk`, `ru`, `tr`, `ur`, `hi`, `id`, `ja`, `ko`, `vi`, `th`, `zh-hans`, `zh-hant`.

Removed locales: `fr`, `fa`, `ku`, `he`.

The developer panel remains Arabic-only by design.

## Developer access

`/dev` is controlled by numeric Telegram IDs in:

```text
lib/developer-access.js
```

Do not replace or erase local developer IDs during pull/deploy workflows.

## Deployment

Telegram Serverless:

```bash
npx tgcloud status
npx tgcloud diff
npx tgcloud migrate
npx tgcloud push
npx tgcloud webhook sync
```

Cloudflare deploys from the `serverless-cleanup` branch through the configured Git integration.

Required Cloudflare variables/secrets:

```text
BOT_TOKEN
B2B_BOT_TOKEN
B2B_WEBHOOK_SECRET
SYNC_SECRET
```

Optional bridge overrides:

```text
B2B_BRIDGE_CHAT_ID
B2B_TARGET_BOT_USERNAME
B2B_MAIN_BOT_ID
```

After Cloudflare deployment, `POST /internal/setup-b2b-webhook` with `Authorization: Bearer <SYNC_SECRET>` to verify the relay, configure its webhook and send the pairing PING.

## Cleanup status

This branch is now in cleanup/stabilization before the next feature phase.

Rules for cleanup:

- active runtime must remain JavaScript-only
- remove obsolete Python/Aiogram files after their JavaScript replacement is confirmed
- do not remove `app/miniapp_static/`
- do not remove compatibility data/schema merely because the old Python code was deleted
- do not delete files whose replacement or current use is uncertain without a separate audit
- keep `main` only as a historical behavioral reference; new work targets `serverless-cleanup`

Obsolete Python/Aiogram files under `app/**/*.py` were removed in the cleanup pass. `app/miniapp_static/` remains the active Mini App frontend.

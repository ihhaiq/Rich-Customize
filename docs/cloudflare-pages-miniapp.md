# Cloudflare Pages deployment for the Mini App

The Telegram Mini App frontend is deployable directly from:

```
app/miniapp_static
```

The existing Python deployment remains compatible. Do not rewrite the legacy
`/miniapp/static/*` asset paths in `index.html`: the Pages `_redirects`
file maps those URLs to the static output root.

## Cloudflare Pages settings

Use these values when importing `ihhaiq/Rich-Customize` from GitHub:

| Setting | Value |
| --- | --- |
| Production branch | `serverless-cleanup` |
| Framework preset | None |
| Root directory | leave empty |
| Build command | `exit 0` |
| Build output directory | `app/miniapp_static` |

Cloudflare will serve `app/miniapp_static/index.html` at the project
`*.pages.dev` root.

Optional build-watch include path:

```
app/miniapp_static/**
```

## Compatibility routes

`app/miniapp_static/_redirects` currently provides:

```
/miniapp/static/* /:splat 200
/miniapp / 302
/miniapp/ / 302
```

This means both the Pages root and the old Mini App asset URLs can load the same
frontend without maintaining a second copy of the static files.

## Current migration boundary

The static frontend is ready for Pages, but the Mini App HTTP API is not moved
yet. The frontend intentionally still calls the existing same-origin routes:

```
/miniapp/api/me
/miniapp/api/pages
/miniapp/api/destinations
/miniapp/api/send
/miniapp/api/upload/*
/miniapp/api/discard-session
/miniapp/api/rich-buttons/user-picker
```

The next migration step is to implement those routes as Cloudflare Pages
Functions/Workers in JavaScript. Keeping the same paths means the frontend will
not need a cross-origin API URL or CORS configuration.

Do not point BotFather at the Pages URL until the API routes needed by the Mini
App have been migrated and smoke-tested.


## Phase 2: Pages Functions API

The old Python Mini App HTTP API now has a JavaScript Pages Functions implementation.

Implemented public routes:

```
GET  /miniapp/api/me
GET  /miniapp/api/pages
POST /miniapp/api/pages
GET  /miniapp/api/pages/:page_id
PUT   /miniapp/api/pages/:page_id
GET  /miniapp/api/destinations
POST /miniapp/api/send
POST /miniapp/api/upload/:kind
POST /miniapp/api/discard-session
POST /miniapp/api/rich-buttons/user-picker
```

Internal migration/bridge routes:

```
POST /internal/sync
POST /internal/complete-user-picker
```

Both internal routes require:

```
Authorization: Bearer <SYNC_SECRET>
```

### D1 setup

Create one D1 database for the Mini App, for example:

```
rich-customize-miniapp
```

Apply:

```
cloudflare/d1/schema.sql
```

Example with Wrangler after logging in to Cloudflare:

```bash
npx wrangler d1 execute rich-customize-miniapp --remote --file=cloudflare/d1/schema.sql
```

Then bind the D1 database to the Pages project with the binding name:

```
DB
```

Dashboard path:

```
Workers & Pages
→ rich-customize-miniapp
→ Settings
→ Bindings
→ Add
→ D1 database
```

### Required secrets and variables

Under Pages → Settings → Variables and Secrets, add:

```
BOT_TOKEN       Secret
SYNC_SECRET     Secret
DEVELOPER_IDS   Variable
```

`BOT_TOKEN` is used only server-side by Pages Functions for Bot API calls such
as uploads and sending a saved Rich Message. Never expose it to the static
frontend or commit it to the repository.

`SYNC_SECRET` protects the internal data migration/bridge routes. Use a long
random value and keep the same value available to the Telegram Serverless side
during Phase 3.

`DEVELOPER_IDS` is a comma-separated list of Telegram user IDs that should be
exempt from the normal 12 saved-page limit.

### D1 source-of-truth cutover

Do not start writing production pages to D1 while the Telegram Serverless bot
still treats its built-in `rich_pages` table as the source of truth.

The safe cutover is:

1. deploy Pages Functions and D1;
2. migrate the existing Telegram Serverless pages and managed chats once through
   `/internal/sync`;
3. switch the Telegram Serverless page/chat registry to the Cloudflare API;
4. smoke-test both the bot editor and Mini App;
5. only then point BotFather at the Pages URL.

Until step 3 is complete, the Pages Functions API should be treated as staging
rather than the production page store.

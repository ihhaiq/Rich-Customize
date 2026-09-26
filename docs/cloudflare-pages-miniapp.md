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

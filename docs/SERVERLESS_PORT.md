# Telegram Serverless port

Target: https://core.telegram.org/bots/serverless

This branch is the JavaScript/V8 port of Rich-Customize for Telegram Serverless.

## Deployment boundary

Telegram deploys only:

- `schema.js`
- `lib/**/*.js`
- `handlers/*.js`

The existing Python source is temporarily retained as a parity/reference tree while
the port is in progress. It is outside the Telegram Serverless deployment manifest
and is never executed by the platform.

## Runtime replacements

| Legacy runtime | Telegram Serverless |
|---|---|
| aiogram Dispatcher/polling | `handlers/<update_type>.js` |
| Bot token + HTTP Bot API client | `api` from `sdk` |
| PostgreSQL | built-in SQLite `db` |
| Redis FSM/idempotency/throttle | SQLite tables in `schema.js` |
| JSON/filesystem fallback | database rows; runtime has no filesystem |
| aiohttp Mini App server | not part of the V8 module runtime; frontend assets remain external/local until a documented Telegram hosting surface is used |
| background loops | event-driven cleanup during handler/database operations |

## Local setup

1. Enable **BotFather → bot → Serverless**.
2. Install Node.js 18+.
3. Run `npm install`.
4. Run `npx tgcloud login` and paste the **CLI access token** (`app<id>:<secret>`),
   not the Bot API token.
5. Inspect with `npm run status` / `npm run diff`.
6. Test individual handlers using `npx tgcloud run handlers/message '{...}'`.
7. Deploy modules with `npm run deploy`.
8. Apply schema separately with `npm run migrate`.
9. Check `npm run webhook`; use `npm run webhook:sync` only if Telegram reports drift.

Never commit `.tgcloud/` or a CLI access token.

## Port rules

- Bare imports only: `lib/x`, `schema`, `sdk`, `sdk/db`.
- No relative imports and no `.js` suffixes in runtime imports.
- No Node built-ins, filesystem, npm runtime dependencies, processes or sockets.
- All database operations are asynchronous and must be awaited.
- No foreign keys; enforce ownership/integrity in queries/application logic.
- Deploy and migrate are separate operations.
- Keep callback_data contracts compatible with the Python bot wherever practical.

## Current port status

Implemented:

- Telegram Serverless schema.
- editor resource limits.
- saved-page persistence and 12-page quota.
- FSM/session persistence with the shared two-hour editor TTL.
- idempotency claims and sliding-window throttling.
- developer IDs stored in the built-in database.

Still to port before feature parity:

- update handlers and routing.
- full block/message parser.
- rich-message renderer and buttons.
- pages/editor UI flows.
- publish destinations/settings.
- localization catalogs.
- media/showcase flows.
- Mini App integration strategy for the existing frontend.

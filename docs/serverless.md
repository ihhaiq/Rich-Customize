# Telegram Serverless notes for this migration

Keep these two references beside the project while porting:

- Official guide: https://core.telegram.org/bots/serverless
- Scaffold SDK reference: `docs/tgcloud-sdk.md`

The official guide is the current platform reference; the scaffold file documents the SDK/CLI conventions shipped with the local project.

## Runtime

- Serverless uses an isolated V8 runtime, not the old Python process and not a normal Node server.
- Deployable code is root `schema.js`, `lib/**/*.js`, and one-level `handlers/*.js`.
- Handlers receive the matching Bot API update payload directly; the complete Update is available as `ctx.update`.
- Use bare imports only: `from 'lib/welcome'`, `from 'schema'`, `from 'sdk'`, `from 'sdk/db'`.
- The runtime has no project filesystem and deployed modules cannot resolve npm packages.
- Use `api.<BotApiMethod>(params)`; successful responses are already unwrapped.
- Bot API failures throw `BotApiError`.
- Use `api.getFileContent(file_id)` or `api.getFileStream(file_id)` for Telegram files. Bot API downloads are capped at 20 MB.
- The database is SQLite-backed and persistent between invocations.
- No foreign keys.
- Every database terminal call is asynchronous.
- `push` and database migration are separate operations.
- The platform manages the webhook from deployed handlers.

## Rich Customize migration decisions

- `rich_pages` preserves legacy `page_id`, owner, blocks, buttons, layout and timestamps.
- A legacy import is allowed to restore more than 12 pages for one owner.
- The 12-page limit will be enforced only when a user creates a new page. It must never prune old/imported pages.
- The old ZIP backup remains the migration source. Only data with a Serverless destination table is imported at each stage; unported backup sections are left untouched for later migration.

For Rich Message and Bot API definitions:
https://core.telegram.org/bots/api

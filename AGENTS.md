# AGENTS.md — Rich Customize Serverless

This branch migrates Rich Customize from Python/Aiogram to Telegram Serverless JavaScript.

## References

Keep both references beside every Serverless change:

1. Official Telegram Serverless guide: https://core.telegram.org/bots/serverless
2. Local scaffold SDK/CLI reference: `docs/tgcloud-sdk.md`

The official guide is the current platform reference. The scaffold file documents the SDK/CLI conventions shipped with the local project. Bot API reference: https://core.telegram.org/bots/api

## Runtime rules

- Telegram runs deployed modules in an isolated V8 runtime.
- Deployable code is root `schema.js`, JavaScript under `lib/`, and one-level `handlers/*.js`.
- Runtime imports use bare module names only: `from 'sdk'`, `from 'sdk/db'`, `from 'schema'`, `from 'lib/...'`.
- No Python runtime, project filesystem access, or npm package resolution exists inside handlers.
- Handler default exports receive the update payload directly; the full Update is available through the handler context.
- Bot API calls use `api.<method>({...})` with Bot API snake_case parameters.
- Bot API failures throw `BotApiError`.
- Use `InputFile` for uploads and `api.getFileContent(file_id)` / `getFileStream` for downloads. Telegram's Bot API download ceiling is 20 MB.
- Database calls are async and must always be awaited.
- Serverless DB schema belongs in root `schema.js`. Do not use foreign keys.
- `tgcloud push` deploys code; `tgcloud migrate` applies schema changes separately.
- Never commit `.tgcloud/`, credentials, bot tokens, or `node_modules/`.

## Migration status

Converted Serverless slices:

- `/start` welcome
- initial `/editor` entry
- initial `📚 صفحاتي` listing backed by `rich_pages`
- complete `/dev` panel surface adapted to Serverless:
  - developer authorization
  - ZIP/JSON import with confirmation
  - ZIP export
  - database diagnostics
  - aggregate and paged user statistics
  - page snapshots + restore drill
  - showcase-channel cache refresh

The old `app/**/*.py` and Python tests remain reference material only and are not deployed by tgcloud.

## Data migration rules

- Keep existing `page_id` and `owner_id`.
- Import/retention never deletes old pages because an owner is above 12 pages.
- The 12-page limit applies only when creating a new page. Existing pages remain editable.
- Old non-page JSON namespaces are retained in `legacy_states` until each dependent subsystem is ported.
- Import is validated and rerunnable. A page snapshot is created before applying an import. Do not describe the multi-table Serverless import as one cross-table transaction.
- Developer access is intentionally closed until numeric Telegram IDs are entered in `lib/developer-access.js`.

## Next migration area

Port the rich editor itself incrementally: editor sessions/state, add-block menu, block handlers/rendering, preview, save/update pages, and publishing. Preserve callback contracts where practical.

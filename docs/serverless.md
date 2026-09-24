# Telegram Serverless notes for Rich Customize

Primary reference: https://core.telegram.org/bots/serverless

Local SDK/CLI reference: `docs/tgcloud-sdk.md`

## Platform model

- Isolated V8 runtime.
- Built-in persistent SQLite-backed database.
- Root `schema.js`, `lib/**/*.js`, and one-level `handlers/*.js` are deployed.
- Use bare imports only.
- The Serverless SDK supplies `api`, `db`, `fetch`, `InputFile`, and `BotApiError`.
- `api.getFileContent(file_id)` returns a `Uint8Array`; Bot API downloads are capped at 20 MB.
- `InputFile` uploads raw bytes through Bot API methods.
- `push` and `migrate` are separate operations.

## Current persistent tables

- `rich_pages` — saved pages, preserving legacy IDs and payload fields.
- `developer_states` — short-lived /dev import flow state.
- `legacy_states` — imported old JSON namespaces not yet consumed by converted features.
- `usage_users`, `usage_minutes`, `usage_runtime` — persistent Serverless usage/operational statistics.
- `page_snapshots` — bounded page recovery snapshots.
- `maintenance_locks` — prevents duplicate import/export/snapshot/refresh operations.

## Developer panel

The old Python /dev actions have Serverless equivalents. PostgreSQL/Redis-specific diagnostics were replaced with Serverless SQLite diagnostics rather than emulated. Editor/FSM activity is reported as not yet migrated until the editor session layer is ported.

Backup import keeps legacy pages even above 12. The limit is a new-page creation rule only.

The old backup format `rich-customize-json-backup-v1` remains supported so Railway exports can be moved into Serverless without rewriting page IDs.


## Legacy published callback compatibility

Published Telegram messages keep their original `callback_data`, so Serverless must continue accepting callback formats emitted by the Python bot.

- `r:page:<page_id>[:source_page_id[:navigation_token]]` and `r:spage:...` remain the canonical page callbacks.
- Legacy raw `r:cbd:...` and `r:cbds:...` callbacks are accepted as aliases for `r:page:...` and `r:spage:...`.
- Imported `button_popups.json` is retained in `legacy_states`; missing popup tokens are restored lazily into `popup_states` when an old published button is pressed.
- Imported `guest_messages.json` is retained in `legacy_states`; missing Guest inline-message context is restored lazily into `guest_messages`.
- `page_navigation.json` is accepted by backup import and valid navigation sessions are restored lazily into `page_navigation_sessions` while they are still within the same 24-hour TTL used by main.
- Expired navigation tokens are intentionally not revived.

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
- `editor_sessions`, `editor_album_items` — persistent editor/FSM and album-collection state.
- `managed_chats`, `managed_publish_panels` — publish destinations and the saved publish-management panel.
- `guest_messages`, `page_navigation_sessions`, `popup_states` — Guest/published-message callback compatibility.
- `developer_states` — short-lived /dev import flow state.
- `legacy_states` — compatibility copy of imported legacy JSON namespaces; converted subsystems hydrate or lazily restore their live tables from it.
- `processed_updates`, `request_windows` — idempotency and throttling state.
- `miniapp_bridge_requests` — short-lived RCB1 Mini App bridge request IDs/status for deduplication and mutation-response replay.
- `usage_users`, `usage_minutes`, `usage_runtime` — persistent Serverless usage/operational statistics.
- `page_snapshots` — bounded page recovery snapshots.
- `maintenance_locks` — prevents duplicate import/export/snapshot/refresh operations.

## Developer panel

The old Python /dev actions have Serverless equivalents. PostgreSQL/Redis-specific diagnostics were replaced with Serverless SQLite diagnostics rather than emulated. Editor/FSM activity is backed by the persistent `editor_sessions` table and is part of the migrated Serverless implementation.

Backup import keeps legacy pages even above 12. The limit is a new-page creation rule only.

The old backup format `rich-customize-json-backup-v1` remains supported so Railway exports can be moved into Serverless without rewriting page IDs. `managed_chats.json` is imported into the live publish tables, and new exports regenerate that legacy-format file from the live Serverless rows. `rich_media.json` remains compatibility metadata only because the page blocks themselves retain the Telegram media `file_id` values used for rendering.


## Mini App B2B bridge

The active Mini App integration plan keeps `rich_pages` in Telegram Serverless as the only persistent page store. Cloudflare hosts the frontend and a stateless relay for `@Richminiappsbot`.

Serverless bridge commands are accepted only from `@Richminiappsbot` in private bridge chat `-1003993506865`. The first valid request pins the sender's numeric bot ID in `legacy_states`.

The `RCB1` bridge supports page list/read/create/save/delete. Read payloads and page bodies are transferred as JSON documents where appropriate. Save operations require `base_updated_at` and use a conditional update so stale Mini App sessions cannot overwrite newer page revisions.

Bridge errors, transport failures, rate-limit alerts and unauthorized access attempts are sent through the existing error-log subsystem when its developer-configured channel is enabled.

## Legacy published callback compatibility

Published Telegram messages keep their original `callback_data`, so Serverless must continue accepting callback formats emitted by the Python bot.

- `r:page:<page_id>[:source_page_id[:navigation_token]]` and `r:spage:...` remain the canonical page callbacks.
- Legacy raw `r:cbd:...` and `r:cbds:...` callbacks are accepted as aliases for `r:page:...` and `r:spage:...`.
- Imported `button_popups.json` is retained in `legacy_states`; missing popup tokens are restored lazily into `popup_states` when an old published button is pressed.
- Imported `guest_messages.json` is retained in `legacy_states`; missing Guest inline-message context is restored lazily into `guest_messages`.
- `page_navigation.json` is accepted by backup import and valid navigation sessions are restored lazily into `page_navigation_sessions` while they are still within the same 24-hour TTL used by main.
- Expired navigation tokens are intentionally not revived.

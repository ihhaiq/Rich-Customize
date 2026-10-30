# Telegram Serverless notes for Rich Customize

Primary reference: https://core.telegram.org/bots/serverless

## Platform model

- Isolated V8 runtime.
- Built-in persistent SQLite-backed database.
- `tgcloud/schema.js`, `tgcloud/lib/**/*.js`, `tgcloud/endpoints/*.js`, and one-level `tgcloud/handlers/*.js` are deployed. A configured Mini App static build can be hosted with the bot. Run CLI from the repository root.
- Prefer project-relative imports ending in `.js`; existing module-name imports (`schema`, `lib/...`) are still present. SDK imports use `sdk` and `sdk/db`.
- The Serverless SDK supplies `api`, `db`, `fetch`, `InputFile`, `BotApiError`, and `EndpointError`.
- `api.getFileContent(file_id)` returns a `Uint8Array`; Bot API downloads are capped at 20 MB.
- `InputFile` uploads raw bytes through Bot API methods.
- `push` and `migrate` are separate operations.
- Since 2026-10-06, Telegram Serverless supports hosting a configured Mini App static build at `https://app<app_id>.tgcloud.ai/` and Mini App `endpoints/` called with `Telegram.WebApp.Serverless.call`. Endpoints receive verified `ctx.initData`; see the [official Serverless guide](https://core.telegram.org/bots/serverless) and the [Mini App migration plan](./miniapp-serverless-migration.md).
- If SQLite or a required table is unavailable, database-backed work fails closed. Unsaved editor drafts remain local and are not authoritative saved pages.

## Current persistent tables

- `rich_pages` — saved pages, preserving legacy IDs and payload fields.
- `editor_sessions`, `editor_album_items` — persistent editor/FSM and album-collection state.
- `managed_chats`, `managed_publish_panels` — publish destinations and the saved publish-management panel.
- `guest_messages`, `page_navigation_sessions`, `popup_states` — Guest/published-message callback compatibility.
- `developer_states` — short-lived /dev import flow state.
- `legacy_states` — compatibility copy of imported legacy JSON namespaces; converted subsystems hydrate or lazily restore their live tables from it.
- `processed_updates`, `request_windows` — idempotency and throttling state.
- `miniapp_bridge_requests` — short-lived RCB1 Mini App bridge request IDs/status for deduplication and mutation-response replay.
- `miniapp_user_picker_requests` — short-lived native Mini App `request_users` state, bound to owner/page/block/revision.
- `usage_users`, `usage_minutes`, `usage_runtime` — persistent Serverless usage/operational statistics.
- Telegram Guest Mode updates arrive through `handlers/guest_message.js`, not the normal `handlers/message.js` path. Enable Guest Mode for the bot in BotFather. Guest requests can receive exactly one reply, sent with `answerGuestQuery`; `/info @username`, `/info@RichCustomizebot @username`, and `/id` use this response path and do not require the bot to join the group. Telegram's Bot API 10.0 documentation describes the guest update and the `answerGuestQuery` contract: [Guest Bots](https://core.telegram.org/bots/features#guest-bots), [answerGuestQuery](https://core.telegram.org/bots/api#answerguestquery).
- `/info @username` or `/info <user-id>` looks up a stored account in any chat, including group/guest use; `/info@RichCustomizebot @username` is accepted. `/id` and `/id@RichCustomizebot` show the invoking user's own profile using the same layout. Replying to a user's message or sending `/info` without an argument also works. Account details appear as ordinary bullet paragraphs, followed by a divider and an open-by-default «صورة الحساب» details block containing only the available profile photo. Account details include a linked name, account ID, username and trusted subscription tier; configured developers display their Developer tier, not Free. Profile fields and username lookup use Telegram updates or `usage_users`; Telegram does not resolve arbitrary usernames to user IDs, so a target username must already be present in the bot's data. A bare mention such as `@RichCustomizebot @username` is delivered through Telegram Guest Mode only when the bot's Guest Mode is enabled in BotFather; otherwise group privacy settings may prevent the bot from receiving it. If the bot is a group member, `/info@RichCustomizebot @username` is the addressed command alternative. Telegram `getUserProfilePhotos` is queried for the selected user's numeric ID; the largest size from the latest photo set is embedded as `photo: { type: 'photo', media: file_id }` per `InputRichBlockPhoto`. If no photo exists, the list appears without a photo section or no-photo message. If fetching the photo fails, the list includes a localized photo-error footer. If Telegram denies photo sending in a group, `/info` retries the rich message without the photo section or a user-visible error; other send failures are surfaced instead of silently replacing the rich layout with plain text. Guest `/info` failures are logged under `guest_message` and return a localized safe diagnostic with the update reference.
- Guest page and user lookup use distinct input forms: `@RichCustomizebot @username` is a username lookup; `/info@RichCustomizebot <numeric-id>` is a numeric user lookup; `/id` is the caller's own account. A standalone exact token after the guest bot mention is a page code, while other text resolves only as the caller's exact saved-page name. Use `@RichCustomizebot /page <name>` to force name matching when a page title resembles a username or code. Page names are never split into arbitrary code candidates, and a numeric user ID is not inferred from a bare guest mention.
- `/info` through a guest update is handled in the dedicated guest handler; it uses the sender's guest-message context and `answerGuestQuery` rather than attempting `sendMessage` to a group where the bot is not a member. A plain-text mention can still be delivered only when Telegram recognizes it as a Guest Mode invocation; the bot must have Guest Mode enabled in BotFather. Guest Mode provides a single reply and does not grant chat history or ongoing updates.
- `page_snapshots` — bounded page recovery snapshots.
- `maintenance_locks` — prevents duplicate import/export/snapshot/refresh operations.

## Developer panel

The old Python /dev actions have Serverless equivalents. PostgreSQL/Redis-specific diagnostics were replaced with Serverless SQLite diagnostics rather than emulated. Editor/FSM activity is backed by the persistent `editor_sessions` table and is part of the migrated Serverless implementation.

Backup import keeps legacy pages even above 12. The limit is a new-page creation rule only.

The old backup format `rich-customize-json-backup-v1` remains supported so Railway exports can be moved into Serverless without rewriting page IDs. `managed_chats.json` is imported into the live publish tables, and new exports regenerate that legacy-format file from the live Serverless rows. `rich_media.json` remains compatibility metadata only because the page blocks themselves retain the Telegram media `file_id` values used for rendering.


## Mini App B2B bridge

The existing Mini App launch link still uses Cloudflare Pages/Functions. A Serverless static build is published at `https://app8416656269.tgcloud.ai/` (revision 113), with direct endpoints for editor identity, pages, destinations, publishing and native user-picker operations. The BotFather launch link has not been changed and the app has not yet been accepted in a Telegram WebView. Other APIs (including media, custom emoji and subscriptions) still fall back to Cloudflare. D1 keeps bridge/support metadata and transitional emoji-pack storage. Owner-specific page mirrors are precheck inputs, never the authoritative saved-page database. See the [migration plan](./miniapp-serverless-migration.md) for the approved boundary and outstanding gates.

Serverless bridge commands are accepted only from `@Richminiappsbot` in private bridge chat `-1003993506865`, addressed to `@RichCustomizebot` with protocol `RCB1`. Numeric relay identity is paired only by the initial PING.

The bridge supports page list/read/create/save/delete, destination discovery, publishing and native user-picker preparation. Page/destination reads use JSON documents where appropriate. SAVE and DELETE require revision tokens. PUBLISH and USER_PICKER are never stale-retried because they create external side effects.

Bridge errors, transport failures, rate-limit alerts and unauthorized access attempts are sent through the existing error-log subsystem when its developer-configured channel is enabled.

## Legacy published callback compatibility

Published Telegram messages keep their original `callback_data`, so Serverless must continue accepting callback formats emitted by the Python bot.

- `r:page:<page_id>[:source_page_id[:navigation_token]]` and `r:spage:...` remain the canonical page callbacks.
- Legacy raw `r:cbd:...` and `r:cbds:...` callbacks are accepted as aliases for `r:page:...` and `r:spage:...`.
- Imported `button_popups.json` is retained in `legacy_states`; missing popup tokens are restored lazily into `popup_states` when an old published button is pressed.
- Imported `guest_messages.json` is retained in `legacy_states`; missing Guest inline-message context is restored lazily into `guest_messages`.
- `page_navigation.json` is accepted by backup import and valid navigation sessions are restored lazily into `page_navigation_sessions` while they are still within the same 24-hour TTL used by main.
- Expired navigation tokens are intentionally not revived.

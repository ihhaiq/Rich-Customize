# Rich Customize — Architecture Map

> Branch: `serverless-cleanup` · Reviewed against repository documentation: 2026-10-10
> This describes the documented design, not an independent live-production audit.

## System overview

```text
Telegram users
   |
   +--> @RichCustomizebot
   |      Telegram Serverless JS
   |      tgcloud/schema.js / tgcloud/handlers/ / tgcloud/lib/
   |      authoritative pages, sessions, permissions, publishing
   |
   +--> Mini App (app/miniapp_static/)
          |
          v
      Cloudflare Pages + Functions (functions/)
          |   validates Telegram initData
          |   D1 (DB): bridge/support state and transitional emoji packs
          v
      @Richminiappsbot (relay)
          |
          v
      Private bot-to-bot bridge (RCB1)
          |
          v
      @RichCustomizebot / Telegram Serverless
```

When the Mini App is opened from its Telegram Serverless origin, page reads
and saved-page mutations use the direct `miniapp` endpoint instead of the
Cloudflare relay. Cloudflare-origin routes and the RCB1 bridge remain for
legacy routes and other supported operations; they are not the storage path
for direct Serverless page CRUD.

## Ownership boundaries
| Component | Paths | Responsibility |
| --- | --- | --- |
| Telegram Serverless | `tgcloud/schema.js`, `tgcloud/handlers/*.js`, `tgcloud/lib/**/*.js` | Authoritative page and editor data, permissions, publication, compatibility and operational state |
| Mini App | `app/miniapp_static/**` | Browser UI and local unsaved edits; direct Serverless page operations use authenticated `initData` and the `miniapp` endpoint |
| Cloudflare Functions | `functions/**` | Cloudflare-origin authentication, legacy relay transport, webhook and upload handling |
| Cloudflare D1 | `cloudflare/d1/schema.sql` | Request correlation, identity, and transitional emoji-pack storage; older page mirrors may remain but Serverless no longer refreshes them. Binding `DB`; saved page truth remains Serverless |
| Documentation | `docs/**`, root Markdown | Architecture and planning; not an executable source of truth |

## Data invariants
1. Do not create a second saved-page database in D1.
2. Authenticate Telegram `initData` before enabling the Mini App editor.
3. Server-side authorization is mandatory; client-side checks are advisory.
4. Saved-page mutations require owner/revision validation.
5. Do not retry stale publishing or user-picker operations.
6. Keep error telemetry sanitized and independent of successful publish outcomes.
7. Preserve compatibility and existing data during cleanup.

## RCB1 bridge
The documented bridge uses `@Richminiappsbot` as relay and `@RichCustomizebot` as main bot. Refer to `README.md` and `AGENTS.md` for command names, pairing, authentication and throttling details. Do not duplicate secrets or rely on this map as a protocol specification.

## Deployment boundaries
- Telegram code/schema changes: follow the documented `tgcloud` workflow; code push and database migration are separate operations.
- Mini App/Cloudflare changes: follow the configured Pages integration and its secrets/bindings.
- Markdown-only updates: do **not** require a Telegram schema migration or a runtime push solely because they are committed.

## Before changing architecture
1. Read `AGENTS.md` and the relevant `docs/` guide.
2. Trace affected data flow across Serverless, bridge and Cloudflare.
3. Identify security, ownership, retry, size and data-loss risks.
4. Test the relevant paths and document actual verification.
5. Update this file and add a decision entry to `md_files/log.md` only for confirmed architectural changes.

# Rich Customize — Architecture Map

> Branch: `serverless-cleanup` · Reviewed against source and documentation: 2026-11-27
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
   +--> Mini App frontend (Telegram Cloud; source: app/miniapp_static/)
          |
          +--> Telegram Cloud static hosting --> authenticated `miniapp` endpoint
          |                                     --> Telegram Serverless data
          |
          +--> supporting/legacy API calls --> Cloudflare Pages Functions / D1 / RCB1 relay
                                               --> @RichCustomizebot / Serverless
```

The Mini App frontend is hosted on Telegram Cloud, not Cloudflare Pages.
Supported page reads and mutations use the authenticated `miniapp` endpoint
directly. Separate supporting API routes still use Cloudflare for media,
telemetry, legacy emoji-pack import and bridge operations. Cloudflare is not
the frontend host or storage path for direct Serverless page CRUD.

## Ownership boundaries
| Component | Paths | Responsibility |
| --- | --- | --- |
| Telegram Serverless | `tgcloud/schema.js`, `tgcloud/handlers/*.js`, `tgcloud/lib/**/*.js` | Authoritative page and editor data, permissions, publication, compatibility and operational state |
| Mini App | `app/miniapp_static/**` | Browser UI and local unsaved edits; direct Serverless page operations use authenticated `initData` and the `miniapp` endpoint |
| Cloudflare Functions | `functions/**` | Supporting/legacy API authentication, relay transport, webhook, media, telemetry and compatibility handling; not the Mini App frontend |
| Cloudflare D1 | `cloudflare/d1/schema.sql` | Request correlation, identity, and transitional emoji-pack storage; older page mirrors may remain but Serverless no longer refreshes them. Binding `DB`; saved page truth remains Serverless |
| Documentation | `md_files/**`, `docs/README.md`, root Markdown | Architecture and planning; not an executable source of truth |

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
- Mini App frontend changes: build and deploy through Telegram Cloud. Supporting Cloudflare Functions changes: follow the configured Pages integration and its secrets/bindings.
- Markdown-only updates: do **not** require a Telegram schema migration or a runtime push solely because they are committed.

## Before changing architecture
1. Read `AGENTS.md` and the relevant `docs/` guide.
2. Trace affected data flow across Serverless, bridge and Cloudflare.
3. Identify security, ownership, retry, size and data-loss risks.
4. Test the relevant paths and document actual verification.
5. Update this file and add a decision entry to `md_files/log.md` only for confirmed architectural changes.

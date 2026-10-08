# Rich Customize — Project Decision Log

> Branch: `serverless-cleanup` · Started: 2026-10-08
> This is a **curated** decision log, not a reconstructed full commit history.
> Historical entries below describe the current repository documentation; they do not assert production deployment.

## Entry format
Each meaningful future change should record:
- **Date / scope**
- **Context and problem**
- **Decision and rationale**
- **Files or systems affected**
- **Verification** (tests, commit/PR, or explicitly not verified)
- **Follow-up / rollback notes**, if relevant

## 2026-10-08 — Documentation baseline
**Context:** Agent work spans Telegram Serverless, Cloudflare and a Mini App. Decisions can be lost between sessions.

**Decision:** Add separate roadmap, decision log and architecture map; leave existing `AGENTS.md` unchanged.

**Scope:** `ROADMAP.md`, `PROJECT-LOG.md`, `ARCHITECTURE.md`.

**Verification:** Documentation-only repository changes. No runtime or deployment validation is implied.

## Existing architectural decisions (documented baseline; date not reconstructed)

### JavaScript serverless is the active implementation
- **Context:** The previous Python/Aiogram implementation was migrated.
- **Decision:** Keep active runtime under `schema.js`, `handlers/`, and `lib/`; do not reintroduce obsolete Python runtime dependencies.
- **Source:** `README.md`, `AGENTS.md`.
- **Verification:** Documentation baseline; inspect current runtime and deployment for production claims.

### Telegram Serverless owns application data
- **Decision:** Keep saved pages, editor state and publishing authorization authoritative in Telegram Serverless. Cloudflare D1 is limited to transient bridge coordination.
- **Rationale:** Avoid conflicting copies of page bodies and ownership state.
- **Source:** `README.md`, `AGENTS.md`.
- **Verification:** Documented architecture; audit write paths when changing bridge behavior.

### RCB1 bridge is security-sensitive
- **Decision:** Preserve bridge-chat and sender checks, deduplication, revision validation, request limits, and no stale retries for publish/user-picker.
- **Source:** `README.md`, `AGENTS.md`.
- **Verification:** Re-run appropriate tests before changing protocol or deployment.

## Maintenance rules
- Append meaningful decisions, not every trivial edit.
- Record failed experiments and reversals when they affect future design.
- Link commits/PRs when available; never fabricate evidence.
- Distinguish `planned`, `implemented`, `tested` and `deployed`.
- For long-term growth, archive older entries under `docs/project-log/YYYY.md` and retain an index here.
- Do not store bot tokens, private user data, Telegram initData or other secrets.

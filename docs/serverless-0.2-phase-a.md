# Serverless CLI 0.2 — Phase A handoff (2026-10-08)

## Scope
Phase A only: CLI version and source layout. Mini App hosting, endpoints, Cloudflare/RCB1 retirement are **out of scope**. `AGENTS.md` remains unchanged per owner instruction.

## Source migration
- Previous branch head: `d335adc7de03f9b8134c2c803d936d141ca00ce5`
- Migration commit: `79ca3cc9cb48ebf949e4c69e19301254f84230e4`
- Moved 80 actual source blobs (including 8 handlers and schema) into `tgcloud/`, preserving their exact Git blob hashes.
- Changed `@tgcloud/cli` requirement from `^0.1.2` to `^0.2.0`.
- Added `tgcloud.jsonc` with schema reference only; no static hosting configured.
- Left old bare imports (`lib/foo`, `schema`) intact because Telegram's documented 0.2 module system still accepts module-name imports; conversion to relative imports is optional and can be done in a separate tested change.
- Git tree comparison verified no unexpected changes outside source move, package.json and new config.

## Not yet verified — deployment blockers
No access to the owner's `.tgcloud/` credentials or linked CLI environment was available in this GitHub-only edit. Therefore these have **not** been run: `tgcloud status`, `tgcloud diff`, `tgcloud upgrade --dry-run`, `tgcloud run`, live bot smoke tests, or `tgcloud push`. Automated tests have not been executed in a checked-out runtime; no test pass is claimed.

## Owner's local verification before any deployment

```powershell
git checkout serverless-cleanup
git pull --ff-only origin serverless-cleanup
npm install
npx tgcloud --version
npx tgcloud status
npx tgcloud diff
node --test tests/serverless/*.test.mjs
```

The old layout is already moved in Git; **do not run `tgcloud upgrade` again blindly**. It is intended for projects still using the root layout. Run `npm install` locally before CLI commands.

Review `status`/`diff` against the currently deployed revision and check all handler names. Because CLI 0.2 `push` treats local modules as the full desired set, unexpected removals are a stop condition. Verify database schema is semantically identical. A deployment is a separate owner-approved action. Never run `push`, `migrate`, or `webhook sync` as part of this preparation.

## Rollback
`d335adc7de03f9b8134c2c803d936d141ca00ce5` is the exact pre-migration source revision. No remote Telegram deployment or DB migration was made here.

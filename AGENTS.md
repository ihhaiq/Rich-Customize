# AGENTS.md — Rich Customize Serverless

This branch is migrating Rich Customize from Python/Aiogram to Telegram Serverless JavaScript.

## Runtime rules

- Telegram runs deployed modules in a V8 isolate.
- Only `schema.js`, JavaScript under `lib/`, and one-level JavaScript handlers under `handlers/` are deployed.
- No Python runtime, filesystem access, or npm packages are available inside handlers.
- Runtime imports use bare module names:
  - `import { api } from 'sdk'`
  - `import { db, eq } from 'sdk/db'`
  - `import { buildWelcomeRichMessage } from 'lib/welcome'`
- Never use relative imports or a `.js` suffix for deployed modules.
- Handler default exports receive the update payload directly. Example: `handlers/message.js` receives a Telegram `Message`.
- Telegram methods are called with `api.<method>({...})` and Bot API snake_case parameter names.
- Database calls are async and must always be awaited.
- Serverless DB schema belongs in root `schema.js`. No foreign keys.
- `tgcloud push` deploys code; `tgcloud migrate` applies schema changes separately.
- Never commit `.tgcloud/`, credentials, bot tokens, or `node_modules/`.

## Migration policy

The old `app/**/*.py` and Python tests are temporary reference material only and are not deployed by tgcloud.
Port one feature at a time into `lib/` + `handlers/`, verify it, then remove the replaced Python module when doing so does not destroy reference needed by an unported feature.

Current converted slice: `/start` welcome Rich Message.

Official platform guide: https://core.telegram.org/bots/serverless
Bot API: https://core.telegram.org/bots/api

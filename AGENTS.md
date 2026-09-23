# AGENTS.md — Rich Customize Serverless

This branch migrates Rich Customize from Python/Aiogram to Telegram Serverless JavaScript.

## References

Use both references while changing Serverless code:

1. Official Telegram Serverless guide: https://core.telegram.org/bots/serverless
2. The local scaffold reference: `docs/tgcloud-sdk.md`

The official guide is the current platform reference. The scaffold documentation is the local SDK/CLI reference shipped with the project. If they differ, verify the behavior against the official guide before changing deployed code.

Bot API reference: https://core.telegram.org/bots/api

## Runtime rules

- Telegram runs deployed modules in an isolated V8 runtime.
- Only root `schema.js`, JavaScript under `lib/`, and one-level JavaScript handlers under `handlers/` are deployed.
- There is no Python runtime, project filesystem access, or npm package resolution inside deployed modules.
- Runtime imports use bare module names:
  - `import { api, db } from 'sdk'`
  - `import { eq } from 'sdk/db'`
  - `import { buildWelcomeRichMessage } from 'lib/welcome'`
- Never use relative imports or a `.js` suffix for deployed modules.
- Handler default exports receive the update payload directly. `handlers/message.js` receives a Telegram `Message`; the complete Update is available as `ctx.update`.
- Telegram methods are called with `api.<method>({...})` and Bot API snake_case parameter names.
- Bot API failures throw `BotApiError`.
- File downloads use the Serverless Bot API helpers such as `api.getFileContent(file_id)`; Telegram's Bot API download ceiling is 20 MB.
- Database calls are async and must always be awaited.
- Serverless DB schema belongs in root `schema.js`. Do not use foreign keys.
- `tgcloud push` deploys modules; `tgcloud migrate` applies schema changes separately.
- Never commit `.tgcloud/`, credentials, bot tokens, or `node_modules/`.

## Migration policy

The old `app/**/*.py` and Python tests are temporary reference material only and are not deployed by tgcloud.

Port one feature at a time into `lib/` + `handlers/`, preserve existing callback contracts where practical, verify the Serverless path, then remove Python reference code only after the dependent feature is fully ported.

Current converted work includes:

- `/start` welcome
- initial `/editor` entry
- initial `📚 صفحاتي` listing backed by Serverless `rich_pages`
- developer/import migration is the next active slice

Saved-page policy: importing or retaining legacy pages never deletes pages because an owner is over the 12-page limit. The limit applies only when creating a new page; existing pages remain editable and must be deleted by the user before another new page can be created.

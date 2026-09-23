# Telegram Serverless notes for this migration

The local tgcloud scaffold defines these constraints:

- Runtime: V8 isolate, not stock Node.js.
- Deployable code: root `schema.js`, `lib/**/*.js`, and one-level `handlers/*.js`.
- Handlers receive the matching Bot API update payload directly; the full Update is available as `ctx.update`.
- Use bare imports only. Example: `from 'lib/welcome'`, not `./welcome.js`.
- Use `api.<BotApiMethod>(params)`; successful responses are already unwrapped to Bot API `result`.
- Bot API failures throw `BotApiError`.
- No bot token is required in source code.
- `push` and database migration are separate operations.
- The platform manages the bot webhook from deployed handlers.

For full Bot API Rich Message definitions, use:
https://core.telegram.org/bots/api

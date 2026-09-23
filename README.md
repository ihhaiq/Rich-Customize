# Rich Customize — Telegram Serverless migration

This branch (`تنضيف`) is the Serverless migration workspace for the Rich Message Editor.

## Current status

The first production slice has been converted from Python/Aiogram to Telegram Serverless JavaScript:

- `handlers/message.js` handles `/start`.
- `lib/welcome.js` builds the localized Rich Message welcome screen.
- The existing welcome languages are preserved.
- Rich Message links for showcase, updates and support are preserved.
- The add-to-group inline button is preserved.
- If Telegram rejects the Rich Message payload, `/start` falls back to a plain text welcome instead of failing silently.

The remaining Python files under `app/` and `tests/` are migration reference only. tgcloud does not deploy them.

## Serverless layout

```text
schema.js
handlers/
  message.js
lib/
  welcome.js
```

Only `schema.js`, `handlers/*.js` and JavaScript modules under `lib/` are deployed.

## Local CLI

```bash
npm install
npx tgcloud login
npx tgcloud status
npx tgcloud push
npx tgcloud webhook
```

There are no database tables in this first slice, so `tgcloud migrate` is not required yet.

To test the message handler server-side:

```bash
npx tgcloud run handlers/message '{"chat":{"id":123456789,"type":"private"},"from":{"id":123456789,"is_bot":false,"first_name":"Hussein","language_code":"ar"},"text":"/start"}'
```

## Important

- Do not add `BOT_TOKEN`; the platform provides Bot API access through `import { api } from 'sdk'`.
- Do not commit `.tgcloud/` or `node_modules/`.
- Runtime modules cannot import npm packages.
- Project-module imports are bare names such as `lib/welcome`, never relative paths.

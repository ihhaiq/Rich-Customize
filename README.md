# Rich Customize — Telegram Serverless migration

Branch: `serverless-cleanup`

This branch is the migration workspace for moving Rich Customize from Python/Aiogram/Railway to Telegram Serverless JavaScript.

Official Serverless reference: https://core.telegram.org/bots/serverless

The local scaffold reference remains in `docs/tgcloud-sdk.md`.

## Converted so far

- `handlers/message.js`: `/start` and `/editor`
- `lib/welcome.js`: localized Rich Message welcome
- `lib/editor-home.js`: first editor screen
- `handlers/callback_query.js`: editor-entry and pages callbacks
- `lib/pages.js`: initial `📚 صفحاتي` listing
- `schema.js`: persistent `rich_pages` table

The remaining Python files under `app/` and `tests/` are migration reference only. tgcloud does not deploy them.

## Serverless layout

```text
schema.js
handlers/
  message.js
  callback_query.js
lib/
  welcome.js
  editor-home.js
  pages.js
```

Only `schema.js`, `handlers/*.js` and JavaScript modules under `lib/` deploy.

## Deployment

```bash
npx tgcloud status
npx tgcloud diff
npx tgcloud push
npx tgcloud migrate
npx tgcloud webhook sync
```

Run `migrate` only when `push` reports schema changes.

## Saved-page compatibility

The Serverless page table keeps the old page IDs and page payload fields so the Railway backup can be imported.

The 12-page limit is a creation limit, not a cleanup rule: old/imported pages are never deleted because an owner already has more than 12. Such a user simply cannot create another page until their count is below 12.

## Important

- Do not add `BOT_TOKEN`; the Serverless SDK provides Bot API access.
- Do not commit `.tgcloud/` or `node_modules/`.
- Runtime modules cannot import npm packages.
- Project imports use bare names such as `lib/welcome`, never relative paths.

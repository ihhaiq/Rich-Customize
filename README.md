# Rich Customize — Telegram Serverless migration

Branch: `serverless-cleanup`

Rich Customize is being moved from Python/Aiogram/Railway to Telegram Serverless JavaScript.

Official platform guide: https://core.telegram.org/bots/serverless

The scaffold SDK reference is kept at `docs/tgcloud-sdk.md`.

## Converted

- `/start` Rich Message welcome
- `/editor` entry screen
- initial `📚 صفحاتي` list backed by Serverless DB
- complete developer-panel surface adapted to Serverless:
  - import ZIP/JSON + confirmation
  - export compatible backup ZIP
  - Serverless DB health/size check
  - persistent user/operational statistics
  - paged user statistics
  - page snapshot + restore drill
  - showcase-channel cache refresh

The remaining Python files are migration references only; tgcloud does not deploy them.

## Backup compatibility

The old `rich-customize-json-backup-v1` format is supported. Saved pages preserve their `page_id`, owner, blocks, buttons, layout, and timestamps. Other old JSON namespaces are stored in `legacy_states` until their feature is ported.

The 12-page rule never prunes old/imported pages. It only prevents creation of a new page when the owner is already at or above the limit.

## Developer access

`/dev` stays closed until numeric Telegram developer IDs are added to `lib/developer-access.js`. If the list is empty, `/dev` tells the sender their own Telegram ID so it can be configured deliberately.

## Deployment

```bash
npx tgcloud status
npx tgcloud diff
npx tgcloud push
npx tgcloud migrate
npx tgcloud webhook sync
```

Run `migrate` only after reviewing the schema changes reported by `push`.

## Next

Port the rich editor incrementally: persisted editor sessions, add-block menu, individual rich block handlers/rendering, preview, page save/update, and publishing.

# Managed Bots — implementation status

Architecture: one Rich Customize repository, one existing Telegram Serverless editor, and a shared Cloudflare webhook router for additional bots. Each bot still needs its own BotFather token. The router does not need a second Telegram Serverless instance per bot.

## Added
- `functions/managed-bots/[botKey].js`: fail-closed POST endpoint; random-key format, D1 lookup, Telegram secret-header verification, size/JSON/update validation.
- `functions/_lib/managed-bots.js`: shared validation.
- `cloudflare/d1/managed_bots.sql`: proposed tenant metadata and update deduplication schema, **not applied**.
- `sups.md`: updated managed-bot product and architecture plan.

## Not yet enabled
- Token registration, getMe and setWebhook provisioning, encryption/secret vault, token rotation.
- Real update dispatcher, Telegram Bot API sender, durable deduplication and retries.
- Owner authorization and editor «بوتاتي» UI, subscription enforcement and billing.
- Secure entitlement synchronization with the editor Serverless, deployment and integration tests.

The endpoint deliberately responds 503 to authenticated updates until durable handling exists. Do not register a live Telegram webhook against it yet; doing so would cause retries without handling updates.

## Credential placement
Use server-side secrets and a verified encrypted credential store. Do not put BotFather tokens in GitHub, D1 plaintext, Mini App assets or the request path. The webhook verification secret is distinct from the bot token.

Do not modify `AGENTS.md` as part of this rollout.

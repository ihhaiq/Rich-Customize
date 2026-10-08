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

## Implemented after foundation

- Central admin-only Cloudflare endpoint `/internal/managed-bots` (GET/POST) with bearer secret `MANAGED_BOTS_ADMIN_KEY`.
- Admin registration checks BotFather token with Telegram `getMe`, rejects the main editor bot, prevents duplicate bot IDs, and stores the token as AES-GCM ciphertext in D1 using server-only `MANAGED_BOT_ENCRYPTION_KEY`.
- Registration does **not** change the bot's existing webhook. Explicit `activate` action with `confirmWebhookTakeover:true` configures `setWebhook` for the shared Cloudflare endpoint.
- The webhook validates Telegram's secret header, decrypts the correct bot credential server-side, supports private `/start` and owner-only `/admin` responses, and records completed update IDs.
- Admin actions `welcome` and `disable` are available. Disabling changes routing status; webhook cleanup and automatic bot-token rotation are **not** implemented.

### Configuration (do not commit values)

Cloudflare Pages runtime secrets:
- `MANAGED_BOTS_ADMIN_KEY`: independently generated long random bearer secret (at least 32 characters).
- `MANAGED_BOT_ENCRYPTION_KEY`: independently generated high-entropy encryption passphrase (at least 32 characters); losing or changing it makes stored tokens undecryptable without migration.
- `DB`: existing D1 binding.

Run the SQL migration in `cloudflare/d1/managed_bots.sql` against the correct D1 database before attempting registration. **No migration or deployment was executed by this change.**

### Critical remaining work before public release

1. Owner-authenticated «بوتاتي» UI in the editor, instead of exposing the administrative bearer endpoint to users.
2. Subscription/license verification and quota enforcement on creation and activation.
3. Robust durable queue/outbox to avoid duplicate outgoing messages when a send succeeds but D1 acknowledgement fails; worker processing and operational retries.
4. Stronger credential lifecycle: token rotation, revocation, secure owner verification, deletion, and webhook restoration policy.
5. Production tests with an isolated test bot, Cloudflare deploy and D1 migration, telemetry and alerting.
6. Telegram Stars payment verification, cancellation/refund reconciliation, and trusted subscription synchronization.

**Do not expose the admin key to a Mini App or browser. Do not onboard customers until the above work is complete.**

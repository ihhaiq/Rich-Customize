# Subscription rollout status — serverless-cleanup

This file tracks **implementation**, not commercial approval. Product specification: [sups.md](../sups.md).

## Implemented in this branch
- `lib/subscription-policy.js`: pure quota/entitlement resolution, with developer bypass for product quotas and Clone's separate free-tier behavior.
- `tests/serverless/subscription-policy.test.mjs`: unit tests for approved text and emoji pack quotas, expiration fallback, Clone isolation and developer bypass.
- These files are **not connected to production handlers or the Mini App yet**. No purchases, paid entitlements or Clone deployments are enabled by this commit.

## Pending before rollout
1. Confirm pricing, duration, refund, cancellation and Clone activation/expiry policy in `sups.md`.
2. Verify Telegram Serverless support for hosting the **separate subscription bot** and for safe bot-to-bot entitlement delivery. Do not assume two bots share the same database.
3. Implement separate subscription-bot runtime, invoice creation, pre-checkout and verified successful-payment processing, idempotent event journal and authoritative entitlement storage.
4. Connect main editor, Mini App, imports, saves, previews, publishing and syncing to a **trusted** entitlement source. Never trust plan fields sent from a client.
5. Implement quotas consistently, including emoji pack persistence and concurrent additions. Protect existing data on downgrades.
6. Validate feasibility of Clone provisioning for customer-supplied bot tokens on Telegram Serverless, isolate all tenant data and implement owner-only `/admin`. Do not sell Clone until verified.
7. Complete localization, operational metrics, migration and deployment tests.

## Where the donation/subscription bot token goes

- The **subscription bot token belongs to the subscription bot's own deployment secrets** on Telegram Serverless. The main editor's bot token must remain separate.
- **Never commit a token** in GitHub source, Markdown, `schema.js`, Cloudflare static assets or test fixtures.
- The exact secret registration command/UI depends on the Telegram Serverless/CLI release and deployment model. Verify official documentation for the installed CLI before provisioning; do not guess an environment variable name or run a fabricated `tgcloud secret` command.
- A Telegram BotFather token is a credential. If accidentally committed or shared publicly, rotate it using BotFather before deploying.
- Use the verified Telegram user ID to identify purchasers. A payment-success redirect or a callback alone is **not** proof of payment.

## Validation

From a local checkout with Node installed:

```sh
node --test tests/serverless/subscription-policy.test.mjs
```

This is a unit-test command, not a production deployment command. Do not run `tgcloud migrate` or `tgcloud push` until a migration/deployment review is complete.

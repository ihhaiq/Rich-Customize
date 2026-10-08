# Subscription rollout status — serverless-cleanup

Updated 2026-10-08. This is an **implementation ledger**, not a production or pricing announcement. Specifications: [sups.md](../sups.md); architecture blocker: [soon.md](../soon.md).

## A1 staged in source — pending local/production verification

- `tgcloud/lib/subscription-policy.js`: trusted entitlement semantics, Free/Plus/Golden text limits **20k/25k/32k** and emoji packs **2/8/50**. Plus/Golden numbers are approved quotas but **not an authorization** to bill or activate these tiers. Purchases remain unavailable.
- `tgcloud/lib/editor-blocks.js` and `functions/_lib/pages.js`: the free text ceiling now derives from policy, not duplicate hardcoded `25000`. Neither route grants plans from client JSON.
- For existing stored pages above 20k, `previousBlocks` is **trusted server-stored** page content. Updates may retain/reduce old size but not expand it; a new page/import/direct-unsaved publish cannot claim a legacy exemption.
- `tgcloud/lib/editor-pages.js`, `tgcloud/lib/editor-session.js`, and `tgcloud/lib/miniapp-bridge.js`: protect manual saves, automatic synchronization and authoritative Mini App SAVE. Verification is after fetching the actual owned record and checking concurrency.
- `functions/miniapp/api/pages/[page_id].js` accepts a legacy PUT within the previous 25k gateway envelope when Cloudflare's mirror is unavailable, but this is **not** the final approval. The verified owner/revision and saved-page comparison in Serverless reject unauthorized size growth. Do not treat the D1 mirror or client-submitted `previousCount` as an entitlement authority.
- Saved-page publish/delivery routes pass the authenticated, stored original as a compatibility baseline to the renderer. Unsaved direct-send does not. Mixed/new content must obey the new free limit.
- `functions/_lib/custom-emoji-packs.js`: free Mini App emoji-packs 1 → **2**, backfill old `miniapp_custom_emoji_primary_pack` into `miniapp_custom_emoji_packs` without destructive SQL, and atomic conditional INSERT for concurrency. `app/miniapp_static/apple_emoji_picker.js` default and cached-pack slicing updated for 2. Developer unlimited access still requires verified Telegram identity.
- `tests/serverless/a1-quotas.test.mjs` and `tests/serverless/a1-emoji-packs.test.mjs` plus existing quota tests are staged. **The automated Node/Cloudflare/Serverless suites have not been run in this session.**

## Important limitations before publishing

1. Cloudflare Mini App pack data currently reside in D1 for the active app, not the future Serverless entitlement database. Do not destroy, overwrite, or silently migrate live pack records. A2 must define the authoritative personal subscription store and a separate safe pack migration if necessary.
2. Existing unsaved direct content has no trusted legacy baseline. If a saved page above 20k is edited locally then sent directly, the strict new limit will block the unsaved payload; saving a reduction or sending the unchanged saved page remains supported. UX for grandfathered overage modifications needs a product decision.
3. Current paid tiers have no verified payment-backed entitlement; nothing in A1 may accept a `plan`, `active`, `developer` or `previousBlocks` field from an HTTP client to unlock paid features.
4. Do not claim parity until Node tests, full regression tests, Cloudflare D1 pack migration/concurrency tests and Telegram Serverless saved-page tests are run.
5. Native Telegram final rich-message byte limits, page footer and callback content remain platform constraints even for exempt developers.

## Still blocked on separate official Managed Bots answer

`@richDonateBot` is designated as the **official managed** payment bot under `@RichCustomizebot`, requiring the same Telegram Serverless project. Whether the manager's single deployment receives updates from all managed bots remains unverified. No Cloudflare billing runtime, customer BotFather token intake, or second deployment is authorized. See [soon.md](../soon.md).

## Local verification (no deployment)

```bash
node --experimental-vm-modules --test tests/serverless/subscription-policy.test.mjs tests/serverless/a1-quotas.test.mjs tests/serverless/developer-limits.test.mjs tests/serverless/a1-emoji-packs.test.mjs
node --experimental-vm-modules --test tests/serverless/*.test.mjs
```

Review any old tests expecting 25k for free; update them only when the new free quota is intended, not by concealing regression. No `tgcloud push`, `tgcloud migrate`, Cloudflare publish, branch merge or production D1 deletion without explicit approval.

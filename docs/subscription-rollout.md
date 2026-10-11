# Subscription rollout — current code versus production

Updated 2026-10-11 — branch `serverless-cleanup`.
Approved product specification: [sups.md](../sups.md). This document
describes code in GitHub, **not** production deployment or paid entitlement activation.

## Single source of truth

All approved numeric quotas are defined in
[`tgcloud/lib/subscription-policy.js`](../tgcloud/lib/subscription-policy.js)
as `PLAN_LIMITS`. The front-end comparison reads
[`app/miniapp_static/plan_catalog.generated.js`](../app/miniapp_static/plan_catalog.generated.js),
which is generated from the server-side policy, not maintained independently.
To update quotas: edit the Serverless policy, run `npm run generate:plans`,
review the diff, and run `npm run test:ci`. The CI `check:plans` fails on drift.

| Limit | Free | Plus | Golden Ticket |
| --- | ---: | ---: | ---: |
| Visible text | 20,000 | 25,000 | 32,768 |
| Total blocks | 50 | 200 | 500 |
| Nesting depth | 4 | 8 | 16 |
| Media attachments | 10 | 25 | 50 |
| Table columns | 8 | 12 | 20 |
| Saved pages | 12 | 50 | 150 |
| Emoji packs | 2 | 8 | 50 |
| Plan price (Stars / 30 days) | 0 | 150 | 350 |

The technical table maximum is 20 columns × 26 rows even for developer accounts.
Additional runtime decisions may apply; the server performs authoritative checks.

## Implemented in repository

- Unified server-side policy and validation entry points in `editor-blocks.js`,
  `editor-session.js`, page CRUD and publish guards.
- Legacy stored pages (`quota_version=1`) remain publish-only; new pages use
  version 2. Import does not silently lift the legacy restriction.
- The Mini App's Free table UI pre-checks against the authenticated
  `/miniapp/api/me` response; the server ultimately decides enforcement.
- Plan comparison displays match generated Serverless policy. Offers remain
  labelled beta / unavailable for purchase.
- Static code, plan generation and Serverless unit tests are part of
  `npm run test:ci`, triggered on Mini App and Serverless changes by
  `.github/workflows/a1-quota-tests.yml`.

## Not yet an active subscription launch

- Only persisted subscriptions with trusted `richdonate:verified` source and
  valid expiry grant non-Free entitlements in Serverless. Cross-bot verified
  purchase activation and renewal still need full production acceptance tests.
- Cloudflare's Mini App `/me` does **not** receive trusted Plus/Golden
  entitlements yet; it may show Free editor limits to non-developers even if
  the server has a different verified entitlement.
- The comparison's 150/350-Star prices are a specification, not a live sale.
  No separate billing engine should be created in Cloudflare.

## Safe rollout / limitations

1. Run `npm run test:ci` and inspect GitHub Actions; a locally mocked pass
   is not equivalent to a real Telegram WebView or a Cloudflare test.
2. Review `tgcloud schema.js` migrations on a cloned database. In particular
   `rich_pages.quota_version`, `forum_topic_defaults`, and
   `scheduled_post_destinations.failure_code` are pending production
   reconciliation where not already applied.
3. Apply and verify migrations before deploying code that requires new columns
   or tables. Do not migrate or `tgcloud push` without owner approval.
4. Verify Telegram Stars events, concurrent page saves, quota boundaries,
   downgrade and expiry, and RCB1 synchronization end to end.

Templates and saved-page version history are intentionally excluded from scope.


## Subscription status and expiry notices (2026-10-12, GitHub only)
- /sup now renders the *effective* trusted entitlement as H1, an expandable
  subscription-benefits Details block, and a remaining-time Footer.
- The 20-locale catalog in tgcloud/lib/subscription-copy.js is shared by
  status and notices. Quota numbers come from subscription-policy.js.
- Paid entitlements must still have source richdonate:verified and active expiry.
  A current 30-day Golden gift takes precedence for display without modifying
  the underlying paid subscription or permanent branding purchases.
- During the final five 24-hour periods, the separate Cloudflare Cron Worker
  sends an ID-free (subscriber-free) bridge tick once per minute. Telegram
  Serverless queries verified paid entitlements and individual gift claims in
  bounded batches, keeps a daily cursor, and records at-most-once notices.
- Caveat: the 10-per-source-per-minute limit bounds throughput (~14,400/day
  per source) and user delivery depends on Telegram access. Ambiguous outcomes
  are marked uncertain rather than resent blindly. Monitor pending throughput
  and expand after load tests; this is not a production delivery guarantee.
- **Pending production actions:** Serverless schema migration and tgcloud push,
  D1 schedule schema migration, Cloudflare reminder Worker deployment,
  bot-to-bot live check and actual expiration/renewal tests.

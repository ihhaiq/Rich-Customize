# Subscription rollout — current code versus production

Updated 2026-10-25 — branch `serverless-cleanup`.
Approved product specification: [sups.md](../sups.md). This document
describes code in GitHub, **not** production deployment or paid entitlement activation.

## Single source of truth

All approved numeric quotas are defined in
[`tgcloud/lib/subscription-policy.js`](../../tgcloud/lib/subscription-policy.js)
as `PLAN_LIMITS`. The front-end comparison reads
[`app/miniapp_static/plan_catalog.generated.js`](../../app/miniapp_static/plan_catalog.generated.js),
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

- `subscription-policy.js` contains the approved plan table and quota helpers;
  the Mini App plan catalog is generated from that policy. This is not proof
  that every editor/runtime path enforces every approved limit: some active
  editor caps are still older than the approved values and must be reconciled
  before claiming full enforcement.
- Legacy stored pages (`quota_version=1`) remain publish-only; new pages use
  version 2. Import does not silently lift the legacy restriction.
- The Mini App's Free table UI pre-checks against the authenticated
  `/miniapp/api/me` response; the server ultimately decides enforcement.
- Plan comparison displays match generated Serverless policy. Offers remain
  labelled beta / unavailable for purchase.
- Static code, plan generation and Serverless unit tests are part of
  `npm run test:ci`, triggered on Mini App and Serverless changes by
  `.github/workflows/a1-quota-tests.yml`.
- `planBenefit(..., 'earlyAccess')` grants the early-access entitlement to an
  active Golden plan, including a currently active Golden gift; the plan card
  and `/sup` display the benefit. No named experimental feature is currently
  wired to this gate, so this entitlement does not yet expose a beta feature.

## Golden Ticket early access

Golden early access is an approved plan benefit, not a promise that a specific
beta is available today. While Golden is active, eligible users may try named
experimental features without an additional charge before general release.
After general release, each feature follows its announced final plan, which may
be Free or a paid tier; early access alone does not grant a permanent
entitlement after the Golden subscription ends or if the final plan excludes
the user.

The remaining implementation work is to choose the first named beta, enforce
its gate using the trusted Serverless entitlement, and document its scope,
rollback path, feedback channel and final post-beta plan.

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
   `scheduled_post_destinations.failure_code`, and the new
   `branding_preferences` table still need reconciliation
   wherever they have not already been applied. The owner confirmed scheduled
   publishing is available and in use on 2026-10-25; see
   [scheduling.md](./scheduling.md). Do not describe that feature as
   undeployed, but keep database reconciliation conditional on the actual
   environment.
3. Apply and verify migrations before deploying code that requires new columns
   or tables. Do not migrate or `tgcloud push` without owner approval.
4. Verify Telegram Stars events, concurrent page saves, quota boundaries,
   downgrade and expiry, and RCB1 synchronization end to end.

Templates and saved-page version history are intentionally excluded from scope.

## Branding visibility preference — local implementation pending rollout

- `branding_preferences` stores an account-level visibility choice separately
  from the permanent payment/entitlement ledger. Trusted active Plus/Golden
  plans, developer entitlements and permanent removal purchases may change it;
  other accounts remain branded and retain the 99-Star cart link.
- Eligible accounts default to hidden branding. The action button says
  «إظهار الحقوق» while hidden and «إخفاء الحقوق» while visible. Explicit target
  values make repeated/stale callbacks idempotent.
- Instant publishing, previews, saved-page delivery and scheduled snapshots
  use the effective preference. A scheduled message captures its current
  setting and does not change when the account preference is later changed.
- This is repository code only until the Serverless schema migration is
  applied and the corresponding code is deployed. No migration or production
  deployment is implied by this note.


## Subscription status and expiry notices (2026-10-12, GitHub only)
- /sup now renders the *effective* trusted entitlement as H1, an expandable
  subscription-benefits Details block, and a remaining-time Footer.
- The 20-locale catalog in tgcloud/lib/subscription-copy.js is shared by
  status and notices. Quota numbers come from subscription-policy.js.
- Paid entitlements must still have source richdonate:verified and active expiry.
  A current 30-day Golden gift takes precedence for display without modifying
  the underlying paid subscription or permanent branding purchases.
- During the final five 24-hour periods, the separate Cloudflare Worker starts
  one daily UTC scan at **09:00 UTC** using `0 9 * * *`. The minute Cron
  `* * * * *` continues to dispatch scheduled posts. If the daily subscriber
  scan has remaining records or bounded Telegram 429 retries, Telegram
  Serverless registers a versioned `sub_` follow-up through the existing RCB1
  D1 scheduler, rather than sending empty subscription heartbeats all day.
  Telegram Serverless queries verified entitlements and gift claims in bounded
  10+10 batches, keeps a per-day CAS-claimed cycle and separate source cursors,
  and records at-most-once notices. The Worker still stores no subscriber IDs.
- Caveat: the 10-per-source-per-batch limit bounds throughput; the scan now
  starts at 09:00 UTC and follow-up batches run at least 75 seconds apart,
  so finishing very large campaigns before UTC midnight is not guaranteed.
  User delivery also depends on Telegram access. Ambiguous outcomes
  are marked uncertain rather than resent blindly. Monitor pending throughput
  and expand after load tests; this is not a production delivery guarantee.
- **Pending subscription-production actions:** live verification of trusted
  payment activation, renewal, expiry and refund behavior; and acceptance of
  subscription-expiry reminders through the bot-to-bot relay. These are
  separate from scheduled publishing, which the owner confirms is already
  available and in use. Verify any required schema migration against the
  target environment before a deployment.

- Temporary Telegram 429 rejects are retried with cooldown (up to five attempts); uncertain outcomes are not resent.

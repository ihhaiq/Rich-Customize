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
- Serverless custom-emoji pack retrieval enforces the trusted plan-visible
  list, including names retained from legacy imports; over-limit legacy names
  remain stored but cannot be accessed unless visible under the current plan.
- The direct Serverless Mini App `/me` response now includes the trusted
  effective plan and all seven approved product quotas. The Mini App exposes
  those values for UX only; page, content, table, and emoji quota decisions
  remain enforced by Serverless. Developer product exemptions do not remove
  separate technical message/table ceilings.
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

## Cross-repository change reporting

Before implementing or proposing a subscription, price, cart/deep-link, Stars
invoice/event, renewal, refund, gift, receipt, reminder, or billing-contract
change, check whether it also changes Rich Donate behavior or its B2B contract.
Report one of: no Rich Donate change identified, or the exact behavior/contract,
data fields, and live tests that need a Rich Donate change. Do not edit that
separate repository unless the owner explicitly asks, and do not describe its
work as complete without inspecting and verifying it.

The currently documented external prerequisite is Rich Donate's independent
implementation and acceptance of the group-routed RDB protocol. A live
Bot-to-Bot handshake and Telegram Stars acceptance test remain unverified;
see the receiver status below. Feature-specific pricing, cart, and event
contract changes must be assessed separately rather than assumed necessary.

## Rich Donate B2B receiver — Serverless code deployed; live integration unverified

- The owner selected the existing private RCB1 group (`-1003993506865`) for
  the entire RDB exchange, overriding the original direct-private chat
  requirement. The Serverless receiver accepts only non-forwarded bot messages
  from `@richDonateBot` in that exact group, requires commands addressed to
  `@RichCustomizebot`, and pins the numeric ID learned from the targeted
  `/rdb_hello_ack_v1`. Events are bounded and validated against the
  `rich-donate/1` schema and exact Stars combinations; ACKs are targeted back
  to `@RichDonateBot` only after the event row is durable.
- The existing Cloudflare Cron Worker sends a minimal RCB1 timer signal every
  ten minutes. Telegram Serverless authenticates the relay, sends
  `/rdb_hello_v1` until the donation bot is pinned, and sends `/rdb_sync_v1`
  thereafter. The Worker does not receive or relay event contents, user IDs,
  or charge IDs. Keep group membership restricted: payment events and opaque
  Telegram charge IDs are visible to its participants.
- `editor_entitlement_events` is the authoritative per-event grant and
  idempotency ledger. Its single-row insert is atomic; active paid access and
  permanent branding are derived from those event rows. This is the approved
  adaptation to the Serverless SDK's lack of cross-table transactions, and it
  differs from the original contract's separate ledger/entitlements update in
  one SQLite transaction. `editor_subscriptions` remains a read-only legacy
  source and is not updated by this receiver.
- Replayed event IDs are idempotent. Refund rows tombstone their order, so a
  delayed purchase cannot restore benefits. Paid renewals add 30 days to the
  active period; a newly purchased plan takes effect immediately. Refunding an
  order rebuilds the active paid timeline from non-refunded orders.
- The authenticated Rich Donate operator console accepts `gift_subscription`.
  It requires the pinned donation-bot identity, a configured editor developer,
  an existing recipient account and validated Plus/Golden/month inputs. Gifts
  are stored in the separate `editor_gift_entitlements` ledger, become active
  after the recipient's current verified or gift period, and are idempotent by
  request ID. A failed recipient notification can be retried without extending
  the entitlement again; `/sup` shows the queued gift and its combined remaining
  duration. Telegram send and SQLite persistence cannot be one atomic operation:
  if Telegram accepts the notice but saving its success state fails, a retry can
  send a duplicate notice, but cannot extend the gift twice.
- The receiver code is present in Telegram Serverless revision 134. This is
  **not** a completed launch: no real Bot-to-Bot group handshake or
  Telegram Stars acceptance test has been completed. Do not send READY; the
  donation bot must independently implement and accept this group-routed
  protocol before paid activation can work. No READY or PAUSE command is sent.
  The manual gift handler is deployed in revision 139; the schema was already
  in sync, so no migration was applied. It is separate from Stars purchase
  delivery and monthly campaign gifts. It has not been tested with a live gift
  request or recipient notification.

## Not yet an active subscription launch

- Paid B2B entitlements are recognized from the local event ledger; legacy
  persisted subscriptions with trusted `richdonate:verified` source remain
  readable. Neither local tests nor the receiver implementation prove a live
  handshake, production activation, renewal, expiry or refund.
- The separate Cloudflare Mini App `/me` still does **not** receive trusted
  Plus/Golden entitlements; it may show Free editor limits when opened from
  the Cloudflare origin. The direct Serverless `/me` does return trusted plan
  and quota data; the BotFather origin cutover and live WebView acceptance
  remain separate.
- The comparison's 150/350-Star prices are a specification, not a live sale.
  No separate billing engine should be created in Cloudflare.

## Safe rollout / limitations

1. Run `npm run test:ci` and inspect GitHub Actions; a locally mocked pass
   is not equivalent to a real Telegram WebView or a Cloudflare test.
2. Review `tgcloud schema.js` migrations on a cloned database. In particular
   `rich_pages.quota_version`, `forum_topic_defaults`,
   `scheduled_post_destinations.failure_code`, `branding_preferences`,
   `editor_entitlement_events`, and `richdonate_bridge` need reconciliation
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
- The separate Cloudflare Worker starts one daily UTC scan at **09:00 UTC**
  using `0 9 * * *`. It sends one warning in the daily interval that covers
  roughly five days before expiry (4–5 days remaining), and a separate notice
  after expiry. With the once-daily scan, the expiry notice may arrive up to
  about 24 hours after the timestamp; the seven-day query window only provides
  recovery if a daily scan is missed. The minute Cron `* * * * *` continues to
  dispatch scheduled posts. If the daily scan has remaining records or bounded
  Telegram 429 retries, Telegram Serverless registers a versioned `sub_`
  follow-up through the existing RCB1 D1 scheduler, rather than sending empty
  subscription heartbeats all day. Telegram Serverless queries verified
  entitlements and gift claims in four bounded   10-row scans (paid, manual gifts and Golden gift claims × before/after
  expiry), uses per-day CAS cursors, and records one delivery per
  user, expiry timestamp and notice stage. The Worker still stores no
  subscriber IDs.
- Expiry notices include a renewal button to
  the plan-specific Rich Donate cart: Plus uses
  `https://t.me/RichDonateBot?start=buyPlus`; Golden uses
  `https://t.me/RichDonateBot?start=buyGT`. Rich Donate confirms `buyGT`
  opens a Golden Ticket (30 days) + permanent branding cart for 449 Stars,
  without issuing an invoice before the user proceeds. The purchase event
  carries `plan=golden`, `permanent_branding=true`, `amount=449`,
  `currency=XTR`. If an expired Golden subscriber already owns permanent
  branding, the button links to the Rich Donate bot without a prefilled cart
  to avoid charging for branding again; the user must select Golden manually.
  `/testsubexpiry` renders the Golden notice for configured developers in
  private chat.
- Caveat: the 10-per-source-per-batch limit bounds throughput; the scan now
  starts at 09:00 UTC and follow-up batches run at least 75 seconds apart,
  so finishing very large campaigns before UTC midnight is not guaranteed.
  User delivery also depends on Telegram access. Ambiguous outcomes
  are marked uncertain rather than resent blindly. Monitor pending throughput
  and expand after load tests; this is not a production delivery guarantee.
- **Pending subscription-production actions:** live verification of trusted
  payment activation, renewal, expiry and refund behavior; acceptance of the
  reminder relay; and live delivery checks for the five-day and expiry
  notices. These are separate from scheduled
  publishing, which the owner confirms is already available and in use.
  Verify any required schema migration against the target environment before
  a deployment.

- Temporary Telegram 429 rejects are retried with cooldown (up to five attempts); uncertain outcomes are not resent.

# Subscription rollout — current status

Updated 2026-10-10. Specification: [sups.md](../sups.md).
This ledger describes repository changes, not a production acceptance report.

## Approved versus implemented
| Area | Approved specification | Repository status |
| --- | --- | --- |
| Text | 20000 / 25000 / 32768 | Editor policy still uses 20000 / 25000 / 32000 |
| Total blocks | 50 / 200 / 500 including nested items | Editor policy still uses 30 / 60 / 120; total-count enforcement needs alignment |
| Nesting / media / columns | 4/8/16, 10/25/50, 8/12/20 | New per-plan checks remain pending |
| Saved pages / emoji packs | 12/50/150 and 2/8/50 | Policy foundations exist; paid activation and trusted Mini App propagation remain pending |
| Prices | Plus 150, Golden 350 Stars per 30 days | Donation cart and Stars receipt flow exist in the separate donation repository |
| Branding | 99 Stars permanent, or included while paid plan is active | Existing entitlements preserved; editor button opens preselected donation cart |
| Early access | Golden benefit | No named experimental features yet |

The donation bot comparison reflects the approved table. It is a display, not evidence that editor quotas or entitlements are active.

## Existing protections
- Server-verified owner, subscription source and expiry; no client-provided plan or developer flag.
- Stored-page compatibility allowance may retain/reduce actual old text, not grow it or authorize new unsaved drafts.
- Cloudflare legacy precheck requires an owner-specific mirror matching base revision/updated_at; Serverless remains authoritative.
- Owner/revision CAS for page writes; cross-session stale content tracking still needs additional work.
- Two free emoji packs in existing D1 storage, atomic insert/backfill; do not delete or automatically migrate user packs.
- Exact own-name lookup in inline/guest, with ambiguous-name refusal; shared codes retain existing behavior.
- Duplicate owner titles refused on bot save/rename/restore and Mini App create/save; owner locks have a lease and need real concurrency verification.

## Billing boundary
Current payment repository: [ihhaiq/richDonate](https://github.com/ihhaiq/richDonate).
Its invoices and receipts do not grant editor benefits until an authenticated durable entitlement event is applied and acknowledged.
Read its [B2B contract](https://github.com/ihhaiq/richDonate/blob/main/docs/editor-b2b-contract.md) before implementing integration.
There is no billing backend on Cloudflare. Do not recreate the archived scaffold or follow the archived multi-bot hosting plan.

## Verification and next work
Run `npm test` from the root. Focused CI is [a1-quota-tests.yml](../.github/workflows/a1-quota-tests.yml).
Local mock/unit successes do not prove real Telegram payments, D1 concurrency, quota boundaries or production deployment.
Complete new quota enforcement, entitlement event handling, downgrade rules and controlled integration testing before claiming full rollout.
Templates and saved page history are cancelled; scheduling is outside the current plans.

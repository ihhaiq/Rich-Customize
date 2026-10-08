# Rich Customize — Subscription Plan

> Planned subscription feature. This document records proposed quotas, not a deployed implementation.

## Subscription plan — premium emoji packs in the Mini App (planned, not implemented)

> Product decision recorded 2026-10-08. This section defines future subscription quotas only. It does not authorize deployment or claim the subscription/billing system exists.

| Subscription tier | Maximum saved/added premium emoji packs per user in the Mini App |
| --- | ---: |
| Free (default) | 2 |
| Plus | 8 |
| Golden | 50 |

### Quota semantics
- Limits are **total per user**, not additive between tiers: Plus allows 8 total, not 2 + 8; Golden allows 50 total, not 8 + 50.
- Count distinct packs currently associated with the user, not how many times a pack is opened.
- Reopening an existing pack must not consume an additional slot.
- Removing a pack releases a slot, subject to future persistence and UI rules.
- A downgrade must not silently delete existing pack data; block adding more packs until usage falls below the new tier's quota, unless a separately approved downgrade policy says otherwise.
- Treat subscription tier as trusted server-side entitlement, never as a client-controlled flag.
- Keep the existing developer exemption described in `AGENTS.md`: verified developers have no product pack quota, but still obey authentication, transport and Telegram API constraints.
- Enforce the same effective limit in the Mini App UI and in the authoritative backend. UI checks alone are not sufficient.

### Before implementation
1. Confirm where user subscriptions and pack associations will be stored in Telegram Serverless; do not create a second authoritative page/subscription database in Cloudflare D1.
2. Define subscription purchase, expiration, renewal and downgrade behavior separately.
3. Add tests for Free 2/3, Plus 8/9, Golden 50/51, reopening, deletion, tier transitions, concurrent adds and developer exemption.
4. Ensure a failed quota check never corrupts the user's existing packs.
5. Mark implementation as complete only after verified code, tests and deployment evidence.


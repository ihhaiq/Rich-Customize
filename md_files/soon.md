# Current next steps — Rich Customize

Updated 2026-10-27. Branch: `serverless-cleanup`.

## Current references
- [Subscription specification](sups.md): approved quotas and remaining implementation.
- [Rollout status](docs/subscription-rollout.md): code versus specification.
- [Roadmap](ROADMAP.md): short list of remaining work.
- [Serverless operations](docs/serverless.md): current `tgcloud/` layout.
- [Mini App Serverless migration](docs/miniapp-serverless-migration.md): phased plan to move the Mini App from Cloudflare to Telegram hosting and endpoints.
- [Change log](log.md): the single active change history.
- [Historical plan](docs/archive/soon-2026-10-08.md): context only; do not execute its old deployment/architecture instructions.

## Next implementation priorities
1. Complete and validate the staged Mini App migration to Telegram Serverless. Static hosting is published at `https://app8416656269.tgcloud.ai/` (revision 113), but BotFather still launches the Cloudflare URL; media, custom emoji and subscription-related APIs still use Cloudflare. Keep reminders, subscriptions, scheduling and related Cloudflare resources in place; the [migration plan](docs/miniapp-serverless-migration.md) defines the boundary and acceptance/rollback gates.
2. Finish reconciling editor quota enforcement with the approved table. The policy and generated Mini App catalog contain the approved numbers, but some active editor paths still use older caps; do not treat the table as fully enforced until those paths and boundary tests agree.
3. Complete and live-test trusted subscription activation, renewal, expiry and refund flows with the payment bot maintained in [ihhaiq/richDonate](https://github.com/ihhaiq/richDonate), not the old scaffold in this repository.
4. Run production-like concurrency and stale-session tests for save/name uniqueness, and verify inline/guest delivery after deployment.
5. Resolve downgrade behavior and connect Golden early access to a named beta. Golden's early-access entitlement is already part of the plan and is shown in `/sup` and the plan card, but no named experimental feature is currently gated by it. During an active Golden subscription, beta use should be free; after general release, the feature follows its announced final Free or paid tier.
6. Scheduled publishing is active. The editor now accepts Baghdad time as `MM-DD hh:mm AM/PM`, offers a cancel button, allows four days for Free and two calendar months for active Plus/Golden, and lets branding beneficiaries choose whether each post shows the branding. Remaining work is reliability/operations: recover registrations without ACK, measure busy-Cron throughput, and test concurrent jobs, cancellation at dispatch, and ambiguous-send recovery. Rescheduling an existing job is not implemented; `/scheduled` currently supports viewing and canceling.

Cloudflare remains active for reminders, subscriptions, scheduling and related services. CLI source migration to `tgcloud/` is already in Git; no repeated blind `upgrade`.
Cleaning documentation does not remove old runtime modules, delete database state, enable payments or prove deployment.

## Golden early-access candidates — proposals, not implemented

Golden early access means active Golden users can try a named beta without an
extra charge before public release. Each beta still needs an explicit owner
approval, trusted Serverless entitlement check, limited rollout/rollback plan,
and a declared final tier. These candidates are not current promises:

1. **Scheduled-post rescheduling and editing:** let users safely change the
   time or content of a pending job, with revision checks and clear handling
   once dispatch begins. Golden could test it first; consider Plus after
   reliability acceptance. This is the strongest immediate candidate because
   viewing/canceling exist but rescheduling does not.
2. **Preflight report before publish:** show final text/block/media counts,
   quota headroom, and validation issues before sending. Beta with Golden, then
   release the basic report to everyone; keep plan-specific limits enforced by
   the server.
3. **Saved-page folders, tags and search:** improve navigation for users with
   many saved pages. Test with Golden first; a basic version could later be
   Free, with any additional storage/automation limits decided separately.
4. **Duplicate a saved page into a new draft:** copy the user's own saved
   content while requiring an explicit save and revalidating page-name
   uniqueness, ownership and quotas. Golden could test first; later availability
   could be Free with existing quotas.

Do not market these until a candidate is approved, implemented and actually
gated. Do not turn the canceled saved-template or saved-page-history features
into this beta list under a different name.

# Current next steps — Rich Customize

Updated 2026-10-10. Branch: `serverless-cleanup`.

## Current references
- [Subscription specification](sups.md): approved quotas and remaining implementation.
- [Rollout status](docs/subscription-rollout.md): code versus specification.
- [Roadmap](ROADMAP.md): short list of remaining work.
- [Serverless operations](docs/serverless.md): current `tgcloud/` layout.
- [Change log](log.md): the single active change history.
- [Historical plan](docs/archive/soon-2026-10-08.md): context only; do not execute its old deployment/architecture instructions.

## Next implementation priorities
1. Implement the approved quota table in runtime and Mini App. The donation comparison is updated, but editor enforcement still requires alignment.
2. Complete verified editor entitlements from the payment bot. The payment bot is maintained in [ihhaiq/richDonate](https://github.com/ihhaiq/richDonate), not the old scaffold in this repository.
3. Test real save/publish/name uniqueness and inline/guest delivery after deployment.
4. Resolve downgrade behavior, expiry notifications and named early-access features.

Cloudflare stays Mini App-only. CLI source migration to `tgcloud/` is already in Git; no repeated blind `upgrade`.
Cleaning documentation does not remove old runtime modules, delete database state, enable payments or prove deployment.

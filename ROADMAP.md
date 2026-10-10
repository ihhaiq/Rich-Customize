# Rich Customize — roadmap

Updated 2026-10-10. Work on `serverless-cleanup`; payment bot work uses `ihhaiq/richDonate/main`.

| Work | Current reference | Next step |
| --- | --- | --- |
| Subscription quotas | [sups.md](sups.md), [rollout](docs/subscription-rollout.md) | Align editor runtime/Mini App with approved table |
| Entitlements and billing | [donation contract](https://github.com/ihhaiq/richDonate/blob/main/docs/editor-b2b-contract.md) | Implement trusted event application/ACK in editor |
| Save reliability | `tgcloud/lib/page-names.js`, `editor-session.js` | Real concurrency and stale-session tests |
| Inline / guest delivery | `tgcloud/lib/page-delivery.js` | Verify exact name and code delivery in Telegram |
| Mini App | [Cloudflare guide](docs/cloudflare-pages-miniapp.md) | Confirm Git deployment and real WebView behavior |
| Search | [search-engine.md](search-engine.md) | Design only; separate implementation scope |
| Marketing | [Referral.md](Referral.md) | Separate plan; verify actual current behavior |

No templates or saved page history. Scheduling remains deferred.
Root `log.md` is the only active change log. [Archived decisions](docs/archive/project-decisions-2026-10-08.md) are historical.
Runtime is JavaScript under `tgcloud/`; archived Python tests are not active.

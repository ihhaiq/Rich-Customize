# Rich Customize — roadmap

Updated 2026-10-25. Work on `serverless-cleanup`; payment bot work uses `ihhaiq/richDonate/main`.

| Work | Current reference | Next step |
| --- | --- | --- |
| Subscription quotas | [sups.md](sups.md), [rollout](docs/subscription-rollout.md) | Reconcile remaining runtime/Mini App paths with approved table |
| Entitlements and billing | [donation contract](https://github.com/ihhaiq/richDonate/blob/main/docs/editor-b2b-contract.md) | Complete and live-test trusted event application/ACK |
| Save reliability | `tgcloud/lib/page-names.js`, `editor-session.js` | Real concurrency and stale-session tests |
| Inline / guest delivery | `tgcloud/lib/page-delivery.js` | Verify exact name and code delivery in Telegram |
| Scheduled publishing | [scheduling](docs/scheduling.md) | Feature is active and owner-confirmed in use; close ACK recovery and load-test gaps |
| Mini App | [Cloudflare guide](docs/cloudflare-pages-miniapp.md) | Confirm Git deployment and real WebView behavior |
| Search | [search-engine.md](search-engine.md) | Design only; separate implementation scope |
| Marketing | [Referral.md](Referral.md) | Separate plan; verify actual current behavior |

No templates or saved page history. Subscription rollout and other remaining work are tracked in [soon.md](soon.md).
Root `md_files/log.md` is the only active change log. [Archived decisions](docs/archive/project-decisions-2026-10-08.md) are historical.
Runtime is JavaScript under `tgcloud/`; archived Python tests are not active.

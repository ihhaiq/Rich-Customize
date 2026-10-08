# Rich Customize — Roadmap

> Branch: `serverless-cleanup` · Updated: 2026-10-08
> This is a navigation and planning document, **not** evidence that proposed work is deployed.

## Status vocabulary
- **Verified in repository**: confirmed from the current branch documentation or code structure.
- **Planned / design only**: described in a planning document; implementation must be checked.
- **Needs verification**: do not claim deployed or complete without inspecting code, tests and runtime.

## Current baseline (verified in repository documentation)
- JavaScript Telegram Serverless runtime: `schema.js`, `handlers/`, `lib/`.
- Mini App frontend: `app/miniapp_static/`.
- Cloudflare Pages Functions: `functions/`.
- Transient D1 bridge state: `cloudflare/d1/`.
- RCB1 bridge between Mini App, relay bot and main bot.
- Current repository documentation describes a cleanup/stabilization phase.

## Workstreams
| Workstream | Reference | Status / next verification |
| --- | --- | --- |
| Serverless cleanup and stability | `AGENTS.md`, `README.md`, `docs/serverless.md` | Ongoing per repository guidance; audit changes before cleanup |
| Mini App bridge and startup reliability | `docs/cloudflare-pages-miniapp.md`, `README.md` | Baseline documented; verify behavior and failure handling before changes |
| Editor architecture | `docs/editor_architecture.md` | Reference documentation; validate against current code |
| Premium emoji | `docs/premium-emoji.md` | Consult documentation and implementation before planning changes |
| Localization | `docs/I18N_GUIDE.md` | Preserve current supported locales and catalog layout |
| Referral / attribution strategy | `Referral.md` | Separate proposal; do not infer completion from the document |
| Future serverless work | `soon.md` | Planning document, not automatic authorization to implement |
| Search system | `search-engine.md` | Design/reference document; verify implementation status |

## Next planning actions
1. Audit each planning document against code and tests before assigning `done` status.
2. Track newly approved work with an owner, acceptance criteria, affected paths and verification evidence.
3. Keep infrastructure changes separate from documentation-only work.
4. Record architectural decisions in `PROJECT-LOG.md` and update `ARCHITECTURE.md` only after verified changes.

## Change discipline
- Do not edit `AGENTS.md` as part of roadmap maintenance without explicit approval.
- Do not silently mark features complete.
- Never deploy or run migrations merely because a Markdown document was edited.
- Preserve production data, credentials, authenticated user ownership and bridge security boundaries.

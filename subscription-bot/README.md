# Subscription bot workspace

This directory is for a second Telegram bot deployed separately from the editor, but maintained in the same repository.

The second bot must have its own BotFather token and Telegram Serverless deployment. Do not place the token in GitHub, Markdown, schema files, or Mini App assets. Register it through the second bot's official Serverless provisioning flow, after checking the installed CLI documentation.

A shared repository does not mean shared databases or shared update handlers. Each bot needs its own Telegram update delivery. Cross-bot entitlement sync must be authenticated, idempotent, and durable.

Status: scaffold only; the second bot is not deployed, no invoices are enabled, and no purchase claims are accepted. Confirm pricing and deployment support before implementing payment processing. Existing 99-star branding purchases in the editor must remain valid.

See ../sups.md and ../docs/subscription-rollout.md for the implementation requirements.

# Tests

The active JavaScript suite is `serverless/*.test.mjs`:

```sh
npm test
```

Run from the repository root with Node 24. Tests using `node:sqlite` require a supported Node version; VM modules use the existing npm test flag.
Python-era tests are preserved as text under [docs/archive/python-tests/](../docs/archive/python-tests/), not collected as an active suite.
Mock/unit tests do not establish live Telegram, Cloudflare D1 or payment acceptance.

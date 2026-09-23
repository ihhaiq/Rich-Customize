from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services.request_guard import IdempotencyMiddleware
from app.services.runtime_redis import RuntimeRedis


class IdempotencyMiddlewareTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_handler_releases_idempotency_claim(self):
        middleware = IdempotencyMiddleware()
        redis = RuntimeRedis()
        handler = AsyncMock(side_effect=RuntimeError("boom"))
        event = SimpleNamespace(update_id=992)

        with patch("app.services.request_guard.runtime_redis", redis):
            with self.assertRaisesRegex(RuntimeError, "boom"):
                await middleware(handler, event, {})

        self.assertTrue(
            await redis.claim_once("telegram-update:992", ttl_seconds=900)
        )


if __name__ == "__main__":
    unittest.main()

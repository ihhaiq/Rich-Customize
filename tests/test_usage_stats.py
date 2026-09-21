from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services.usage_stats import UsageStats


class UsageStatsTests(unittest.IsolatedAsyncioTestCase):
    async def test_user_profiles_and_operational_metrics_persist(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {"DATABASE_URL": ""},
            clear=False,
        ):
            path = Path(directory) / "usage_stats.json"
            stats = UsageStats(path)
            await stats.startup({
                8: {"first_seen": 800, "last_seen": 900},
            })

            user = SimpleNamespace(
                id=7,
                username="hussein",
                first_name="Hussein",
                last_name=None,
                language_code="ar",
            )
            await stats.observe_user(user, now=1000)
            await stats.record_request(120.0, failed=False, now=1000)
            await stats.record_operation("preview", success=True)
            await stats.record_operation("publish", success=False, count=2)

            snapshot = await stats.snapshot(now=1000)
            operational = await stats.operational_snapshot(now=1000)
            users, total = await stats.users_page(0, page_size=10)

            self.assertEqual(snapshot["tracked_users"], 2)
            self.assertEqual(snapshot["profiled_users"], 1)
            self.assertEqual(snapshot["active_1h"], 2)
            self.assertEqual(snapshot["languages"]["ar"], 1)
            self.assertEqual(total, 2)
            self.assertEqual(users[0]["user_id"], 7)
            self.assertEqual(users[0]["username"], "hussein")
            self.assertEqual(operational["requests_current_minute"], 1)
            self.assertEqual(operational["avg_response_ms_current_minute"], 120.0)
            self.assertEqual(operational["operations"]["preview_success"], 1)
            self.assertEqual(operational["operations"]["publish_failed"], 2)

            await stats.flush()

            reloaded = UsageStats(path)
            await reloaded.startup()
            restored = await reloaded.snapshot(now=1000)
            restored_operational = await reloaded.operational_snapshot(now=1000)

            self.assertEqual(restored["tracked_users"], 2)
            self.assertEqual(restored["events"], 1)
            self.assertEqual(
                restored_operational["operations"]["publish_failed"],
                2,
            )


if __name__ == "__main__":
    unittest.main()

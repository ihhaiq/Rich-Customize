import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, PropertyMock, patch

from app.services.page_registry import PageRegistry
from app.storage import state_database


class PageRegistryTests(unittest.IsolatedAsyncioTestCase):
    async def test_named_pages_are_persistent_isolated_and_listed_per_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pages.json"
            registry = PageRegistry(path)
            blocks = [{"id": "one", "type": "paragraph", "position": 0, "data": {}}]

            second = await registry.save(7, "ثانية", blocks, [], 2, "center")
            first = await registry.save(7, "أولى", blocks, [], 1, "right")
            await registry.save(8, "صفحة مستخدم آخر", blocks, [], 1, "center")

            blocks[0]["id"] = "changed-outside"
            saved = await registry.get(first)
            self.assertEqual(saved["blocks"][0]["id"], "one")
            saved["blocks"][0]["id"] = "changed-copy"
            self.assertEqual((await registry.get(first))["blocks"][0]["id"], "one")

            pages = await registry.list_for_user(7)
            self.assertEqual([page["title"] for page in pages], ["أولى", "ثانية"])
            self.assertEqual({page["page_id"] for page in pages}, {first, second})

            reloaded = PageRegistry(path)
            self.assertEqual((await reloaded.get(second))["title"], "ثانية")

    async def test_startup_migrates_legacy_snapshot_once_database_is_connected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pages.json"
            path.write_text(
                '{"abc12345":{"owner_id":7,"title":"Legacy","blocks":[],"buttons":[]}}',
                encoding="utf-8",
            )
            registry = PageRegistry(path)
            migrate = AsyncMock(return_value=1)

            with patch.object(
                type(state_database),
                "connected",
                new_callable=PropertyMock,
                return_value=True,
            ), patch.object(
                state_database,
                "migrate_legacy_pages",
                migrate,
            ):
                self.assertEqual(await registry.startup(), 1)

            migrated = migrate.await_args.args[0]
            self.assertIn("abc12345", migrated)
            self.assertEqual(migrated["abc12345"]["owner_id"], 7)

    async def test_update_reuses_owned_code_and_delete_checks_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = PageRegistry(Path(directory) / "pages.json")
            code = await registry.save(5, "قديم", [{"id": "a"}], [], 1, "center")

            updated = await registry.save(
                5, "جديد", [{"id": "b"}], [], 1, "left", page_id=code,
            )

            self.assertEqual(updated, code)
            updated_page = await registry.get(code)
            self.assertEqual(updated_page["title"], "جديد")
            self.assertIn("created_at", updated_page)
            self.assertIn("updated_at", updated_page)
            self.assertFalse(await registry.delete(code, 99))
            self.assertTrue(await registry.delete(code, 5))
            self.assertIsNone(await registry.get(code))

    async def test_rename_is_persistent_and_checks_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pages.json"
            registry = PageRegistry(path)
            code = await registry.save(5, "قديم", [{"id": "a"}], [], 1, "center")

            self.assertFalse(await registry.rename(code, 99, "غير مسموح"))
            self.assertEqual((await registry.get(code))["title"], "قديم")
            self.assertTrue(await registry.rename(code, 5, "الاسم الجديد"))

            self.assertEqual((await registry.get(code))["title"], "الاسم الجديد")
            self.assertEqual((await PageRegistry(path).get(code))["title"], "الاسم الجديد")

    async def test_query_filters_and_sorts_inside_registry_service(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = PageRegistry(Path(directory) / "pages.json")
            blocks = [{"id": "a"}]
            beta = await registry.save(5, "Beta", blocks, [], 1, "center")
            alpha = await registry.save(5, "Alpha target", blocks, [], 1, "center")
            await registry.save(8, "Other owner target", blocks, [], 1, "center")

            pages, total_count = await registry.query_for_user(
                5,
                query="target",
                sort_mode="title",
            )

            self.assertEqual(total_count, 2)
            self.assertEqual([page["page_id"] for page in pages], [alpha])
            self.assertNotIn(beta, [page["page_id"] for page in pages])


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

from app.services.page_registry import PageRegistry


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

    async def test_update_reuses_owned_code_and_delete_checks_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = PageRegistry(Path(directory) / "pages.json")
            code = await registry.save(5, "قديم", [{"id": "a"}], [], 1, "center")

            updated = await registry.save(
                5, "جديد", [{"id": "b"}], [], 1, "left", page_id=code,
            )

            self.assertEqual(updated, code)
            self.assertEqual((await registry.get(code))["title"], "جديد")
            self.assertFalse(await registry.delete(code, 99))
            self.assertTrue(await registry.delete(code, 5))
            self.assertIsNone(await registry.get(code))


if __name__ == "__main__":
    unittest.main()

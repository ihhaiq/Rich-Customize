from __future__ import annotations

import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


class CleanupArchitectureTests(unittest.TestCase):
    def test_locales_package_is_gone_and_app_has_no_locales_imports(self):
        self.assertFalse((APP / "locales").exists())
        leaked: list[str] = []
        for path in APP.rglob("*.py"):
            source = path.read_text(encoding="utf-8")
            if "app.locales" in source:
                leaked.append(str(path.relative_to(ROOT)))
        self.assertEqual(leaked, [])

    def test_keyboards_are_feature_scoped(self):
        self.assertFalse((APP / "keyboards.py").exists())
        package = APP / "keyboards"
        expected = {
            "__init__.py",
            "blocks.py",
            "details.py",
            "developer.py",
            "editor.py",
            "message_buttons.py",
            "pages.py",
            "publishing.py",
        }
        self.assertTrue(package.is_dir())
        self.assertTrue(expected.issubset({path.name for path in package.iterdir()}))

    def test_feature_aggregators_only_compose_routers(self):
        for relative in (
            "routers/block_management.py",
            "routers/button_actions.py",
            "routers/message_buttons.py",
            "routers/details.py",
        ):
            path = APP / relative
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(path))
            self.assertNotIn("LEGACY_", source, relative)
            self.assertNotIn("detach_legacy", source, relative)
            functions = [node.name for node in tree.body if isinstance(node, ast.FunctionDef)]
            async_functions = [
                node.name for node in tree.body if isinstance(node, ast.AsyncFunctionDef)
            ]
            self.assertEqual(functions + async_functions, [], relative)

    def test_page_domain_operations_live_in_service_layer(self):
        support = (APP / "routers" / "page_support.py").read_text(encoding="utf-8")
        actions = (APP / "routers" / "page_actions.py").read_text(encoding="utf-8")
        service = (APP / "services" / "page_editor.py").read_text(encoding="utf-8")
        self.assertIn("def paginate_pages", service)
        self.assertIn("async def query_user_pages", service)
        self.assertIn("async def persist_page_draft_change", service)
        self.assertNotIn("page_screen =", support)
        self.assertNotIn("pages_for_user =", support)
        self.assertNotIn("save_changed_draft =", support)
        self.assertIn("from app.services.page_editor import", actions)

    def test_details_domain_operations_live_in_service_layer(self):
        support = (APP / "routers" / "details_support.py").read_text(encoding="utf-8")
        service = (APP / "services" / "details_editor.py").read_text(encoding="utf-8")
        for name in (
            "details_children",
            "find_details_child",
            "add_details_child",
            "delete_details_child",
            "move_details_child",
            "replace_details_child",
        ):
            self.assertIn(f"def {name}", service)
            self.assertNotIn(f"def {name}", support)

    def test_i18n_public_module_is_a_facade(self):
        source = (APP / "i18n.py").read_text(encoding="utf-8")
        self.assertIn("from app.i18n_runtime import", source)
        self.assertIn("from app.i18n_profile import", source)
        self.assertNotIn("class LocaleMiddleware", source)
        self.assertNotIn("async def configure_bot_profile", source)
        self.assertNotIn("def tr(", source)
        self.assertNotIn("def t(", source)


if __name__ == "__main__":
    unittest.main()

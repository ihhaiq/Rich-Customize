from __future__ import annotations

from pathlib import Path

from app.lang import AR_PHRASES, KEY_TRANSLATIONS, PHRASES, SUPPORTED_LANGUAGES
from app.lang.catalogs.migration_semantic import SEMANTIC_PHRASES


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


def test_common_catalog_is_a_small_facade() -> None:
    facade = APP / "lang" / "catalogs" / "common.py"
    data = APP / "lang" / "catalogs" / "common_data.py"
    assert data.exists()
    assert facade.stat().st_size < 2_000
    source = facade.read_text("utf-8")
    assert "from app.lang.catalogs.common_data import" in source


def test_chinese_compatibility_bridge_is_gone() -> None:
    assert not (APP / "translations_zh.py").exists()
    source = (APP / "i18n_core.py").read_text("utf-8")
    assert "app.translations_zh" not in source
    assert "app.lang.catalogs.chinese" in source


def test_semantic_migration_keys_cover_every_locale() -> None:
    required = set(SEMANTIC_PHRASES)
    assert required <= set(PHRASES)
    assert required <= set(AR_PHRASES)
    for language in SUPPORTED_LANGUAGES - {"ar", "en"}:
        assert required <= set(KEY_TRANSLATIONS[language]), language


def test_migrated_editor_ui_has_no_source_string_translation_calls() -> None:
    paths = [
        APP / "keyboards" / "blocks.py",
        APP / "keyboards" / "details.py",
        APP / "keyboards" / "publishing.py",
        APP / "routers" / "editor_ui.py",
    ]
    for path in paths:
        assert "tr(" not in path.read_text("utf-8"), path


def test_miniapp_backend_is_feature_scoped() -> None:
    webapp = APP / "webapp"
    expected = {
        "__init__.py",
        "auth.py",
        "buttons.py",
        "constants.py",
        "links.py",
        "pages.py",
        "server.py",
        "uploads.py",
    }
    assert expected <= {path.name for path in webapp.iterdir()}
    for legacy in ("miniapp_links.py", "miniapp_rich_buttons.py", "miniapp_uploads.py"):
        assert not (APP / legacy).exists()


def test_miniapp_has_no_developer_user_compatibility_alias() -> None:
    sources = "\n".join(path.read_text("utf-8") for path in (APP / "webapp").glob("*.py"))
    assert "developer_user" not in sources
    assert "/miniapp/api/upload/photo" not in sources


def test_miniapp_public_module_is_a_small_facade() -> None:
    source = (APP / "miniapp.py").read_text("utf-8")
    assert len(source) < 3_000
    assert "from app.webapp" in source
    assert "async def api_save_page" not in source
    assert "async def start_mini_app_server" not in source

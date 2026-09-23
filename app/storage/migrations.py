from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config


def run_database_migrations(database_url: str | None = None) -> None:
    url = (database_url or os.getenv("DATABASE_URL", "")).strip()
    if not url:
        return
    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.attributes["configure_logger"] = False
    os.environ["DATABASE_URL"] = url
    command.upgrade(config, "head")


__all__ = ["run_database_migrations"]

"""bootstrap core storage tables

Revision ID: 20260921_0001
Revises:
Create Date: 2026-09-21
"""
from alembic import op


revision = "20260921_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS makes this safe for installations created by the pre-Alembic
    # bootstrap code. Alembic becomes the schema owner from this revision onward.
    op.execute("""
        CREATE TABLE IF NOT EXISTS rich_state (
            namespace TEXT PRIMARY KEY,
            payload JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS rich_fsm (
            storage_key TEXT PRIMARY KEY,
            state TEXT,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS rich_migrations (
            name TEXT PRIMARY KEY,
            completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS rich_pages (
            page_id TEXT PRIMARY KEY,
            owner_id BIGINT NOT NULL,
            title TEXT NOT NULL,
            blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
            buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
            buttons_per_row SMALLINT NOT NULL DEFAULT 1,
            buttons_align TEXT NOT NULL DEFAULT 'center',
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_rich_pages_owner_updated
        ON rich_pages (owner_id, updated_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_rich_pages_owner_created
        ON rich_pages (owner_id, created_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_rich_pages_owner_title
        ON rich_pages (owner_id, lower(title))
    """)


def downgrade() -> None:
    # Never destroy user data automatically during rollback.
    pass

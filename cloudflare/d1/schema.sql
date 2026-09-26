CREATE TABLE IF NOT EXISTS rich_pages (
  page_id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  blocks TEXT NOT NULL DEFAULT '[]',
  buttons TEXT NOT NULL DEFAULT '[]',
  buttons_per_row INTEGER NOT NULL DEFAULT 1,
  buttons_align TEXT NOT NULL DEFAULT 'center',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rich_pages_owner_updated
  ON rich_pages(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS miniapp_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

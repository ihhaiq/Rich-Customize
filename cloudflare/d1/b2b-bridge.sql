-- P0 B2B relay state only.
-- No page blocks, buttons, titles, or page bodies are stored in Cloudflare D1.

CREATE TABLE IF NOT EXISTS miniapp_bridge_pending (
  request_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  page_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  response_kind TEXT,
  response_file_id TEXT,
  response_json TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_miniapp_bridge_pending_user
  ON miniapp_bridge_pending(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_miniapp_bridge_pending_expires
  ON miniapp_bridge_pending(expires_at);


CREATE TABLE IF NOT EXISTS miniapp_bridge_identity (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

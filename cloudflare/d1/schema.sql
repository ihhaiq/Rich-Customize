-- Cloudflare D1 schema for Mini App relay/support state only.
-- Saved page bodies live exclusively in Telegram Serverless rich_pages.

CREATE TABLE IF NOT EXISTS miniapp_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);


CREATE TABLE IF NOT EXISTS managed_chats (
  key TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  username TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_managed_chats_user
  ON managed_chats(user_id);

CREATE INDEX IF NOT EXISTS idx_managed_chats_chat
  ON managed_chats(chat_id);

CREATE TABLE IF NOT EXISTS popup_states (
  token TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_popup_states_updated
  ON popup_states(updated_at);

-- Short-lived correlation state for the Telegram B2B Mini App relay.
-- This table never stores page blocks/buttons/content.
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

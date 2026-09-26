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

CREATE TABLE IF NOT EXISTS miniapp_user_pickers (
  request_id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  page_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  marker TEXT,
  title TEXT,
  color TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_miniapp_user_pickers_owner
  ON miniapp_user_pickers(owner_id, created_at);

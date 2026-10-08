-- Apply only after deployment review; separate from page content storage.
-- webhook_secret is a Telegram webhook verification secret, NOT a BotFather token.
CREATE TABLE IF NOT EXISTS managed_bots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  bot_telegram_id TEXT NOT NULL UNIQUE,
  bot_username TEXT,
  webhook_key TEXT NOT NULL UNIQUE,
  webhook_secret TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK(status IN ('disabled','active','suspended','needs_relink')),
  welcome_text TEXT NOT NULL DEFAULT '',
  license_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_managed_bots_owner ON managed_bots(owner_id);
CREATE TABLE IF NOT EXISTS managed_bot_updates (
  bot_id TEXT NOT NULL,
  update_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','completed','failed')),
  received_at INTEGER NOT NULL,
  PRIMARY KEY(bot_id, update_id),
  FOREIGN KEY(bot_id) REFERENCES managed_bots(id)
);

-- Cloudflare D1 schema for Mini App relay/support state only.
-- Saved page bodies live exclusively in Telegram Serverless rich_pages.

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


CREATE TABLE IF NOT EXISTS miniapp_bridge_identity (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Reminder metadata only. The rich post snapshot belongs to Telegram Serverless.
CREATE TABLE IF NOT EXISTS schedule_reminders (
  job_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  run_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending','dispatching','awaiting_ack','sent','partially_sent','failed','uncertain','canceled','exhausted'
  )),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedule_reminders_due
  ON schedule_reminders(status, next_attempt_at, run_at);

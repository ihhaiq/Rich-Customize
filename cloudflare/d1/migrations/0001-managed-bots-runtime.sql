-- Apply ONCE after managed_bots.sql; additive, preserves existing rows.
ALTER TABLE managed_bots ADD COLUMN bot_name TEXT NOT NULL DEFAULT '';
ALTER TABLE managed_bots ADD COLUMN welcome_page_id TEXT;
ALTER TABLE managed_bots ADD COLUMN commands_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE managed_bots ADD COLUMN last_error TEXT;
ALTER TABLE managed_bots ADD COLUMN operation_key TEXT;
ALTER TABLE managed_bots ADD COLUMN operation_at INTEGER;
CREATE UNIQUE INDEX managed_bot_license_unique ON managed_bots(license_id) WHERE license_id IS NOT NULL;
CREATE TABLE managed_bot_licenses (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','cancelled','expired')),
 expires_at INTEGER NOT NULL, version INTEGER NOT NULL, source_event TEXT NOT NULL UNIQUE, updated_at INTEGER NOT NULL
);
CREATE INDEX managed_licenses_owner ON managed_bot_licenses(owner_id);
CREATE TABLE managed_license_events (
 event_id TEXT PRIMARY KEY, license_id TEXT NOT NULL, version INTEGER NOT NULL, digest TEXT NOT NULL, received_at INTEGER NOT NULL,
 UNIQUE(license_id, version)
);
-- Page bodies and popup bodies are deliberately absent from this schema.
CREATE TABLE managed_bot_jobs (
 bot_id TEXT NOT NULL, job_id TEXT NOT NULL, payload_encrypted TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','processing','sending','completed','failed','uncertain','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0, lease_key TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0, error_code TEXT, message_id INTEGER, bridge_request_id TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(bot_id,job_id)
);
CREATE INDEX managed_jobs_recovery ON managed_bot_jobs(status,next_attempt_at,lease_until);
CREATE TABLE managed_bot_publications (
 bot_id TEXT NOT NULL, chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, page_id TEXT NOT NULL, page_revision INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, PRIMARY KEY(bot_id,chat_id,message_id)
);
CREATE TABLE managed_bot_rate_windows (key TEXT PRIMARY KEY, window INTEGER NOT NULL, hits INTEGER NOT NULL);
-- Old processing entries have unknown outcomes. Never automatically resend them.
INSERT OR IGNORE INTO managed_bot_jobs(bot_id,job_id,payload_encrypted,status,created_at,updated_at)
 SELECT bot_id,'u:'||update_id,'',CASE WHEN status='completed' THEN 'completed' ELSE 'uncertain' END,received_at,received_at
 FROM managed_bot_updates;

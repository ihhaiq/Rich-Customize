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

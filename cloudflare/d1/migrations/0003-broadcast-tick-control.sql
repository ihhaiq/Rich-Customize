CREATE TABLE IF NOT EXISTS broadcast_tick_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

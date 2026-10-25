CREATE TABLE IF NOT EXISTS owner_login_challenges (
  id_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  attempt_nonce TEXT NOT NULL DEFAULT '',
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS owner_login_expiry ON owner_login_challenges(expires_at);
CREATE TABLE IF NOT EXISTS owner_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS owner_session_expiry ON owner_sessions(expires_at);

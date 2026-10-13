-- My Diary encrypted cloud sync metadata.
-- Financial plaintext and Vault keys must never be stored in this database.

CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  nickname_norm TEXT NOT NULL UNIQUE,
  account_salt BLOB NOT NULL,
  auth_verifier BLOB NOT NULL,
  unlock_pepper_ciphertext BLOB NOT NULL,
  unlock_pepper_iv BLOB NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash BLOB NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS sync_heads (
  account_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  object_key TEXT,
  object_sha256 TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device_token_hash BLOB NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS devices_account_idx ON devices(account_id);

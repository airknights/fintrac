-- fintrac local schema. Applied on boot (idempotent).
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  account_id         TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  institution_name   TEXT,
  type               TEXT NOT NULL,   -- depository | credit | loan | investment | other
  subtype            TEXT,
  current_balance    REAL DEFAULT 0,
  iso_currency       TEXT DEFAULT 'USD',
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id  TEXT PRIMARY KEY,  -- hash of (account_id, date, amount, name) — re-import safe
  account_id      TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  name            TEXT,
  merchant_name   TEXT,
  amount          REAL NOT NULL,     -- positive = outflow (spending)
  iso_currency    TEXT DEFAULT 'USD',
  date            TEXT NOT NULL,     -- YYYY-MM-DD
  category        TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);

-- Manually-entered APR / minimum payment for debt accounts (the only source
-- now that there's no Plaid liabilities data).
CREATE TABLE IF NOT EXISTS debt_overrides (
  account_id       TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  apr_percentage   REAL,
  minimum_payment  REAL,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

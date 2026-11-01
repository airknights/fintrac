-- Initial schema. IF NOT EXISTS so it also adopts databases created before migrations existed.

CREATE TABLE IF NOT EXISTS accounts (
  account_id         TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  institution_name   TEXT,
  type               TEXT NOT NULL,   -- depository | credit | loan | investment | other
  subtype            TEXT,
  current_balance    NUMERIC(14,2) NOT NULL DEFAULT 0,
  iso_currency       TEXT NOT NULL DEFAULT 'CAD',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id  TEXT PRIMARY KEY,  -- hash of (account_id, date, amount, name) — re-import safe
  account_id      TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  name            TEXT,
  merchant_name   TEXT,
  amount          NUMERIC(14,2) NOT NULL,  -- positive = outflow (spending)
  iso_currency    TEXT NOT NULL DEFAULT 'CAD',
  date            DATE NOT NULL,
  category        TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);

-- Manually-entered APR / minimum payment for debt accounts.
CREATE TABLE IF NOT EXISTS debt_overrides (
  account_id       TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  apr_percentage   NUMERIC(6,3),
  minimum_payment  NUMERIC(14,2),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

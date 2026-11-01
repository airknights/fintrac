-- Balances follow the transactions. The stored balance is now an anchor: the
-- balance as of balance_as_of (typed in by the user, or the newest row of a CSV
-- balance column). An account's current balance = anchor + transactions dated
-- after balance_as_of. See ACCOUNTS_SQL in src/db/queries.ts.

ALTER TABLE accounts RENAME COLUMN current_balance TO anchor_balance;
ALTER TABLE accounts ADD COLUMN balance_as_of DATE;
UPDATE accounts SET balance_as_of = updated_at::date;
ALTER TABLE accounts ALTER COLUMN balance_as_of SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN balance_as_of SET DEFAULT CURRENT_DATE;

-- Credit cards: derived from "available credit" + balance; available credit
-- is then limit - current balance.
ALTER TABLE accounts ADD COLUMN credit_limit NUMERIC(14,2);

-- Import order, so same-day transactions keep the bank's order for running balances.
-- Existing rows are numbered in arbitrary order.
ALTER TABLE transactions ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE INDEX idx_tx_account_date_seq ON transactions(account_id, date, seq);

-- Some credit lines add billed interest to what's owed; others collect it from
-- another account. Off by default: interest is tracked but doesn't move the balance.
ALTER TABLE accounts ADD COLUMN interest_in_balance BOOLEAN NOT NULL DEFAULT false;

-- 0003 back-filled balance_as_of with the last-updated date, which is too late
-- for accounts whose balance came from a CSV balance column (that balance is
-- as of the file's newest row) and wrong for accounts that never had one.

-- Balance came from an imported balance column: it's as of the newest transaction.
UPDATE accounts a
SET balance_as_of = t.newest
FROM (SELECT account_id, max(date) AS newest FROM transactions GROUP BY account_id) t
WHERE t.account_id = a.account_id
  AND a.import_mapping ? 'balanceCol'
  AND t.newest < a.balance_as_of;

-- Zero balance and nothing imported: no balance known yet.
UPDATE accounts a
SET balance_as_of = NULL
WHERE a.anchor_balance = 0
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.account_id = a.account_id);

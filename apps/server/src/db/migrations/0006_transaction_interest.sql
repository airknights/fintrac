-- Interest on a credit line is a cost of carrying it, tracked apart from the
-- amount: it doesn't move the balance.
ALTER TABLE transactions ADD COLUMN interest NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Move interest rows already imported into credit lines over to the new column.
UPDATE transactions t
SET interest = CASE WHEN t.name ~* 'revers|refund|rebate' THEN -abs(t.amount) ELSE abs(t.amount) END,
    amount = 0
FROM accounts a
WHERE a.account_id = t.account_id
  AND a.type = 'credit'
  AND a.subtype ~* 'line of credit|credit line|heloc|\mloc\M'
  AND t.name ~* '\minterest\M';

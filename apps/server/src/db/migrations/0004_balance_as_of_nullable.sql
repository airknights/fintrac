-- NULL balance_as_of = no balance known yet (account created without one).
-- Its balance then comes from all of its transactions, and the first CSV
-- balance column or typed-in balance anchors it.

ALTER TABLE accounts ALTER COLUMN balance_as_of DROP NOT NULL;
ALTER TABLE accounts ALTER COLUMN balance_as_of DROP DEFAULT;

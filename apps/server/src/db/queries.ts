import { randomUUID, createHash } from "node:crypto";
import type pg from "pg";
import { pool, query, withTransaction } from "./index.js";

// ── Accounts ───────────────────────────────────────────────────
// How a transaction moves an account's balance. amount is + for money out:
// that lowers a bank balance but raises what's owed on a card or loan.
// Interest only counts on accounts set to add it to the balance.
export const DELTA_SQL = `CASE WHEN a.type IN ('credit','loan')
  THEN t.amount + CASE WHEN a.interest_in_balance THEN t.interest ELSE 0 END
  ELSE -t.amount END`;

// Accounts with balances derived from the transactions: the anchor balance
// (as of balance_as_of) plus every transaction dated after it. With no
// balance_as_of (never set), every transaction counts.
export const ACCOUNTS_SQL = `
  SELECT a.account_id, a.name, a.institution_name, a.type, a.subtype, a.iso_currency,
         a.import_mapping, a.updated_at, a.anchor_balance, a.balance_as_of, a.credit_limit, a.interest_in_balance,
         a.anchor_balance + COALESCE(later.delta, 0) AS current_balance,
         CASE WHEN a.type = 'credit' AND a.credit_limit IS NOT NULL
              THEN a.credit_limit - (a.anchor_balance + COALESCE(later.delta, 0)) END AS available_credit,
         (SELECT COALESCE(SUM(t.interest), 0) FROM transactions t WHERE t.account_id = a.account_id) AS total_interest
  FROM accounts a
  LEFT JOIN LATERAL (
    SELECT SUM(${DELTA_SQL}) AS delta
    FROM transactions t
    WHERE t.account_id = a.account_id AND (a.balance_as_of IS NULL OR t.date > a.balance_as_of)
  ) later ON true`;

export interface CreateAccountInput {
  name: string;
  institutionName?: string | null;
  type: string;
  subtype?: string | null;
  isoCurrency?: string | null;
  openingBalance?: number | null;
  // Credit cards / lines of credit: the limit, or available credit to derive it from.
  creditLimit?: number | null;
  availableCredit?: number | null;
}

export async function createAccount(input: CreateAccountInput): Promise<string> {
  const accountId = randomUUID();
  // A typed balance is today's; none (or 0) means "not known yet" — the first
  // imported balance column or typed balance will anchor it.
  const balance = input.openingBalance ?? 0;
  const balanceKnown = balance !== 0;
  const creditLimit =
    input.type !== "credit"
      ? null
      : (input.creditLimit ?? (input.availableCredit != null ? input.availableCredit + balance : null));
  await query(
    `INSERT INTO accounts (account_id, name, institution_name, type, subtype, anchor_balance, balance_as_of,
                           credit_limit, iso_currency, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $9 THEN CURRENT_DATE END, $7, $8, now())`,
    [
      accountId,
      input.name,
      input.institutionName ?? null,
      input.type,
      input.subtype ?? null,
      balance,
      creditLimit,
      input.isoCurrency ?? "CAD",
      balanceKnown,
    ],
  );
  return accountId;
}

// The user typed the balance (and, for cards, the credit limit or available
// credit) as their bank shows it today. Transactions up to today are taken as
// already included. Returns false if no such account.
export async function updateAccountBalance(
  accountId: string,
  update: { balance?: number; creditLimit?: number | null; availableCredit?: number | null },
): Promise<boolean> {
  return withTransaction(async (client) => {
    if (update.balance !== undefined) {
      await client.query(
        `UPDATE accounts SET anchor_balance = $1, balance_as_of = CURRENT_DATE, updated_at = now() WHERE account_id = $2`,
        [update.balance, accountId],
      );
    }
    const { rows } = await client.query(`${ACCOUNTS_SQL} WHERE a.account_id = $1`, [accountId]);
    const account = rows[0];
    if (!account) return false;
    if (update.creditLimit !== undefined || update.availableCredit !== undefined) {
      // A limit is stored as is; available credit + balance owed = limit.
      const limit =
        update.creditLimit !== undefined
          ? update.creditLimit
          : update.availableCredit === null || update.availableCredit === undefined
            ? null
            : update.availableCredit + account.current_balance;
      await client.query(`UPDATE accounts SET credit_limit = $1, updated_at = now() WHERE account_id = $2`, [
        limit,
        accountId,
      ]);
    }
    return true;
  });
}

// Updates only the fields given (undefined = leave as is). Returns false if no such account.
export async function updateAccountDetails(
  accountId: string,
  fields: {
    name?: string;
    institutionName?: string | null;
    type?: string;
    subtype?: string | null;
    creditLimit?: number | null;
    interestInBalance?: boolean;
  },
): Promise<boolean> {
  const columns = {
    name: fields.name,
    institution_name: fields.institutionName,
    type: fields.type,
    subtype: fields.subtype,
    credit_limit: fields.creditLimit,
    interest_in_balance: fields.interestInBalance,
  };
  const set = Object.entries(columns).filter(([, v]) => v !== undefined);
  const assignments = set.map(([col], i) => `${col} = $${i + 1}`).join(", ");
  const rows = await query(
    `UPDATE accounts SET ${assignments}${set.length ? ", " : ""}updated_at = now()
     WHERE account_id = $${set.length + 1} RETURNING account_id`,
    [...set.map(([, v]) => v), accountId],
  );
  return rows.length > 0;
}

export async function deleteAccount(accountId: string): Promise<void> {
  await query(`DELETE FROM accounts WHERE account_id = $1`, [accountId]);
}

export function getAccounts(): Promise<any[]> {
  return query(`${ACCOUNTS_SQL} ORDER BY a.type, a.name`);
}

// ── Transactions ───────────────────────────────────────────────
export interface TransactionInput {
  accountId: string;
  name?: string | null;
  merchantName?: string | null;
  amount: number;
  isoCurrency?: string | null;
  date: string;
  category?: string | null;
  // Credit lines: interest cost, kept apart from amount so it doesn't move the balance.
  interest?: number;
  // The amount as the file had it, when amount was zeroed for an interest row,
  // so re-importing the file still finds the same transaction.
  idAmount?: number;
}

// Whether interest on this account is tracked separately from its balance.
export function isCreditLine(type: string, subtype: string | null): boolean {
  return type === "credit" && /line of credit|credit line|heloc|\bloc\b/i.test(subtype ?? "");
}

// Deterministic id so re-importing an overlapping CSV export upserts instead
// of duplicating rows.
export function hashTransactionId(accountId: string, date: string, amount: number, name: string | null): string {
  return createHash("sha256").update(`${accountId}|${date}|${amount}|${name ?? ""}`).digest("hex").slice(0, 32);
}

// Pass a transaction client to batch many upserts atomically.
export async function upsertTransaction(t: TransactionInput, db: pg.Pool | pg.PoolClient = pool): Promise<void> {
  const transactionId = hashTransactionId(t.accountId, t.date, t.idAmount ?? t.amount, t.name ?? null);
  await db.query(
    `INSERT INTO transactions (transaction_id, account_id, name, merchant_name, amount, iso_currency, date, category, interest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (transaction_id) DO UPDATE SET
       account_id = excluded.account_id,
       name = excluded.name,
       merchant_name = excluded.merchant_name,
       amount = excluded.amount,
       iso_currency = excluded.iso_currency,
       date = excluded.date,
       category = excluded.category,
       interest = excluded.interest`,
    [
      transactionId,
      t.accountId,
      t.name ?? null,
      t.merchantName ?? null,
      t.amount,
      t.isoCurrency ?? "CAD",
      t.date,
      t.category ?? null,
      t.interest ?? 0,
    ],
  );
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  await query(`DELETE FROM transactions WHERE transaction_id = $1`, [transactionId]);
}

// ── Debt overrides ───────────────────────────────────────────────
export async function setDebtOverride(accountId: string, apr: number | null, minimum: number | null): Promise<void> {
  await query(
    `INSERT INTO debt_overrides (account_id, apr_percentage, minimum_payment, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (account_id) DO UPDATE SET
       apr_percentage = excluded.apr_percentage,
       minimum_payment = excluded.minimum_payment,
       updated_at = now()`,
    [accountId, apr, minimum],
  );
}

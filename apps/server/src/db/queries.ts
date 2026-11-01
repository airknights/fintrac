import { randomUUID, createHash } from "node:crypto";
import type pg from "pg";
import { pool, query } from "./index.js";

// ── Accounts ───────────────────────────────────────────────────
export interface CreateAccountInput {
  name: string;
  institutionName?: string | null;
  type: string;
  subtype?: string | null;
  isoCurrency?: string | null;
  openingBalance?: number | null;
}

export async function createAccount(input: CreateAccountInput): Promise<string> {
  const accountId = randomUUID();
  await query(
    `INSERT INTO accounts (account_id, name, institution_name, type, subtype, current_balance, iso_currency, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      accountId,
      input.name,
      input.institutionName ?? null,
      input.type,
      input.subtype ?? null,
      input.openingBalance ?? 0,
      input.isoCurrency ?? "CAD",
    ],
  );
  return accountId;
}

export async function updateAccountBalance(accountId: string, balance: number): Promise<void> {
  await query(`UPDATE accounts SET current_balance = $1, updated_at = now() WHERE account_id = $2`, [
    balance,
    accountId,
  ]);
}

// Returns false if no such account.
export async function updateAccountInstitution(accountId: string, institutionName: string | null): Promise<boolean> {
  const rows = await query(
    `UPDATE accounts SET institution_name = $1, updated_at = now() WHERE account_id = $2 RETURNING account_id`,
    [institutionName, accountId],
  );
  return rows.length > 0;
}

export async function deleteAccount(accountId: string): Promise<void> {
  await query(`DELETE FROM accounts WHERE account_id = $1`, [accountId]);
}

export function getAccounts(): Promise<any[]> {
  return query(`SELECT * FROM accounts ORDER BY type, name`);
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
}

// Deterministic id so re-importing an overlapping CSV export upserts instead
// of duplicating rows.
export function hashTransactionId(accountId: string, date: string, amount: number, name: string | null): string {
  return createHash("sha256").update(`${accountId}|${date}|${amount}|${name ?? ""}`).digest("hex").slice(0, 32);
}

// Pass a transaction client to batch many upserts atomically.
export async function upsertTransaction(t: TransactionInput, db: pg.Pool | pg.PoolClient = pool): Promise<void> {
  const transactionId = hashTransactionId(t.accountId, t.date, t.amount, t.name ?? null);
  await db.query(
    `INSERT INTO transactions (transaction_id, account_id, name, merchant_name, amount, iso_currency, date, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (transaction_id) DO UPDATE SET
       account_id = excluded.account_id,
       name = excluded.name,
       merchant_name = excluded.merchant_name,
       amount = excluded.amount,
       iso_currency = excluded.iso_currency,
       date = excluded.date,
       category = excluded.category`,
    [
      transactionId,
      t.accountId,
      t.name ?? null,
      t.merchantName ?? null,
      t.amount,
      t.isoCurrency ?? "CAD",
      t.date,
      t.category ?? null,
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

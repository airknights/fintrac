import { randomUUID, createHash } from "node:crypto";
import { db } from "./index.js";

// ── Accounts ───────────────────────────────────────────────────
export interface CreateAccountInput {
  name: string;
  institutionName?: string | null;
  type: string;
  subtype?: string | null;
  isoCurrency?: string | null;
  openingBalance?: number | null;
}

export function createAccount(input: CreateAccountInput): string {
  const accountId = randomUUID();
  db.prepare(
    `INSERT INTO accounts (account_id, name, institution_name, type, subtype, current_balance, iso_currency, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    accountId,
    input.name,
    input.institutionName ?? null,
    input.type,
    input.subtype ?? null,
    input.openingBalance ?? 0,
    input.isoCurrency ?? "USD",
  );
  return accountId;
}

export function updateAccountBalance(accountId: string, balance: number): void {
  db.prepare(`UPDATE accounts SET current_balance = ?, updated_at = datetime('now') WHERE account_id = ?`).run(
    balance,
    accountId,
  );
}

export function deleteAccount(accountId: string): void {
  db.prepare(`DELETE FROM accounts WHERE account_id = ?`).run(accountId);
}

export function getAccounts(): any[] {
  return db.prepare(`SELECT * FROM accounts ORDER BY type, name`).all();
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

export function upsertTransaction(t: TransactionInput): void {
  const transactionId = hashTransactionId(t.accountId, t.date, t.amount, t.name ?? null);
  db.prepare(
    `INSERT INTO transactions (transaction_id, account_id, name, merchant_name, amount, iso_currency, date, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(transaction_id) DO UPDATE SET
       account_id = excluded.account_id,
       name = excluded.name,
       merchant_name = excluded.merchant_name,
       amount = excluded.amount,
       iso_currency = excluded.iso_currency,
       date = excluded.date,
       category = excluded.category`,
  ).run(
    transactionId,
    t.accountId,
    t.name ?? null,
    t.merchantName ?? null,
    t.amount,
    t.isoCurrency ?? "USD",
    t.date,
    t.category ?? null,
  );
}

export function deleteTransaction(transactionId: string): void {
  db.prepare(`DELETE FROM transactions WHERE transaction_id = ?`).run(transactionId);
}

// ── Debt overrides ───────────────────────────────────────────────
export function setDebtOverride(accountId: string, apr: number | null, minimum: number | null): void {
  db.prepare(
    `INSERT INTO debt_overrides (account_id, apr_percentage, minimum_payment, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET
       apr_percentage = excluded.apr_percentage,
       minimum_payment = excluded.minimum_payment,
       updated_at = datetime('now')`,
  ).run(accountId, apr, minimum);
}

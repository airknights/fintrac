import { Hono } from "hono";
import { query } from "../db/index.js";
import { ACCOUNTS_SQL, DELTA_SQL } from "../db/queries.js";

export const transactionRoutes = new Hono();

// Categories that are money movement, not spending.
const NON_SPENDING = ["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"];

// Newest first, optionally for one account and/or matching a search term.
// running_balance is the account's balance after each transaction, worked
// back from its current balance over the account's full history (so a search
// filter doesn't change it).
transactionRoutes.get("/transactions", async (c) => {
  const limit = Math.max(1, Math.min(Number(c.req.query("limit") ?? 100), 500));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0));
  const accountId = c.req.query("accountId") || null;
  const search = c.req.query("q")?.trim() || null;

  const rows = await query(
    `WITH a AS (${ACCOUNTS_SQL}),
     ledger AS (
       SELECT t.transaction_id, t.account_id, t.name, t.merchant_name, t.amount, t.date, t.category, t.seq,
              a.name AS account_name, a.type AS account_type,
              a.current_balance - COALESCE(SUM(${DELTA_SQL}) OVER (
                PARTITION BY t.account_id ORDER BY t.date DESC, t.seq DESC
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS running_balance
       FROM transactions t JOIN a ON a.account_id = t.account_id
       WHERE $1::text IS NULL OR t.account_id = $1
     )
     SELECT *, COUNT(*) OVER () AS total_count
     FROM ledger
     WHERE $2::text IS NULL OR name ILIKE '%' || $2 || '%' OR merchant_name ILIKE '%' || $2 || '%'
     ORDER BY date DESC, seq DESC
     LIMIT $3 OFFSET $4`,
    [accountId, search, limit, offset],
  );
  const total = rows[0]?.total_count ?? 0;
  return c.json({
    transactions: rows.map(({ total_count: _, seq: __, ...t }) => ({ ...t, running_balance: round2(t.running_balance) })),
    total,
  });
});

// Spending breakdown by category over the last N days (default 30).
// Sign convention: positive amount = outflow (money spent).
transactionRoutes.get("/spending", async (c) => {
  const days = Math.max(1, Math.min(Number(c.req.query("days") ?? 30), 365));
  const rows = await query(
      `SELECT COALESCE(category, 'UNCATEGORIZED') AS category,
              SUM(amount) AS total,
              COUNT(*) AS count
       FROM transactions
       WHERE amount > 0
         AND date >= CURRENT_DATE - $1::int
         AND COALESCE(category,'') <> ALL($2::text[])
       GROUP BY COALESCE(category, 'UNCATEGORIZED')
       ORDER BY total DESC`,
    [days, NON_SPENDING],
  );

  const byCategory = rows.map((r: any) => ({
    category: r.category,
    total: round2(r.total),
    count: r.count,
  }));
  const total = round2(byCategory.reduce((s, r) => s + r.total, 0));
  return c.json({ days, total, byCategory });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

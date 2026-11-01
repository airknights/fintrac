import { Hono } from "hono";
import { db } from "../db/index.js";

export const transactionRoutes = new Hono();

// Categories that are money movement, not spending.
const NON_SPENDING = ["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"];

transactionRoutes.get("/transactions", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const rows = db
    .prepare(`SELECT * FROM transactions ORDER BY date DESC, transaction_id LIMIT ?`)
    .all(limit);
  return c.json({ transactions: rows });
});

// Spending breakdown by category over the last N days (default 30).
// Sign convention: positive amount = outflow (money spent).
transactionRoutes.get("/spending", (c) => {
  const days = Math.max(1, Math.min(Number(c.req.query("days") ?? 30), 365));
  const placeholders = NON_SPENDING.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT COALESCE(category, 'UNCATEGORIZED') AS category,
              SUM(amount) AS total,
              COUNT(*) AS count
       FROM transactions
       WHERE amount > 0
         AND date >= date('now', ?)
         AND COALESCE(category,'') NOT IN (${placeholders})
       GROUP BY COALESCE(category, 'UNCATEGORIZED')
       ORDER BY total DESC`,
    )
    .all(`-${days} days`, ...NON_SPENDING);

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

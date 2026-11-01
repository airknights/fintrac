// One-off: copy data from the old SQLite file (apps/server/data/fintrac.db)
// into Postgres. Safe to re-run — rows are upserted by primary key.
//   npm run db:import-sqlite --workspace apps/server
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initDb, pool, withTransaction } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlitePath = process.argv[2] ?? resolve(__dirname, "..", "..", "data", "fintrac.db");

if (!existsSync(sqlitePath)) {
  console.error(`[import-sqlite] No SQLite file at ${sqlitePath}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const all = (sql: string) => sqlite.prepare(sql).all() as any[];

// Nothing is tracked in USD, so old 'USD' labels become CAD on the way over.
const currency = (c: unknown) => (!c || c === "USD" ? "CAD" : String(c));
const timestamp = (t: unknown) => (t ? `${t}Z` : new Date().toISOString()); // SQLite datetime('now') is UTC

await initDb();

const accounts = all(`SELECT * FROM accounts`);
const transactions = all(`SELECT * FROM transactions`);
const overrides = all(`SELECT * FROM debt_overrides`);

await withTransaction(async (client) => {
  for (const a of accounts) {
    await client.query(
      `INSERT INTO accounts (account_id, name, institution_name, type, subtype, anchor_balance, iso_currency, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (account_id) DO UPDATE SET
         name = excluded.name, institution_name = excluded.institution_name, type = excluded.type,
         subtype = excluded.subtype, anchor_balance = excluded.anchor_balance,
         iso_currency = excluded.iso_currency, updated_at = excluded.updated_at`,
      [a.account_id, a.name, a.institution_name, a.type, a.subtype, a.current_balance ?? 0, currency(a.iso_currency), timestamp(a.updated_at)],
    );
  }
  for (const t of transactions) {
    await client.query(
      `INSERT INTO transactions (transaction_id, account_id, name, merchant_name, amount, iso_currency, date, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (transaction_id) DO UPDATE SET
         account_id = excluded.account_id, name = excluded.name, merchant_name = excluded.merchant_name,
         amount = excluded.amount, iso_currency = excluded.iso_currency, date = excluded.date, category = excluded.category`,
      [t.transaction_id, t.account_id, t.name, t.merchant_name, t.amount, currency(t.iso_currency), t.date, t.category],
    );
  }
  for (const o of overrides) {
    await client.query(
      `INSERT INTO debt_overrides (account_id, apr_percentage, minimum_payment, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id) DO UPDATE SET
         apr_percentage = excluded.apr_percentage, minimum_payment = excluded.minimum_payment, updated_at = excluded.updated_at`,
      [o.account_id, o.apr_percentage, o.minimum_payment, timestamp(o.updated_at)],
    );
  }
});

console.log(
  `[import-sqlite] Copied ${accounts.length} accounts, ${transactions.length} transactions, ${overrides.length} debt overrides.`,
);
sqlite.close();
await pool.end();

import { Hono } from "hono";
import { z } from "zod";
import { query, withTransaction } from "../db/index.js";
import { ACCOUNTS_SQL, DELTA_SQL, upsertTransaction, type TransactionInput } from "../db/queries.js";

export const importRoutes = new Hono();

// Picks the delimiter that appears most in the first lines (outside quotes is
// close enough here). Some bank "CSV" exports are really tab-separated.
function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/, 10).join("\n");
  const counts = [",", "\t", ";"].map((d) => [d, head.split(d).length - 1] as const);
  return counts.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

// Minimal RFC4180-subset CSV parser: handles quoted fields, embedded
// delimiters, and "" as an escaped quote. Good enough for bank export files.
function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, ""); // strip a UTF-8 BOM so it doesn't stick to the first cell
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const previewSchema = z.object({ csv: z.string().min(1) });
// The client windows the preview itself, so send every row (capped for sanity).
const PREVIEW_MAX_ROWS = 50_000;

// Returns the file's rows raw so the user can pick which row holds the column
// names and where transactions start (some files have account info above the
// header, e.g. CTFS; some have no header at all, e.g. TD).
importRoutes.post("/accounts/:id/import-preview", async (c) => {
  const parsed = previewSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) return c.json({ error: "CSV file is empty" }, 400);

  const sample = rows.slice(0, PREVIEW_MAX_ROWS);
  const columnCount = sample.reduce((max, r) => Math.max(max, r.length), 0);
  return c.json({ rows: sample, columnCount });
});

const dateFormats = z.enum(["YMD", "MDY", "DMY"]);

const mappingSchema = z.object({
  dateCol: z.number().int().min(0),
  nameCol: z.number().int().min(0),
  amountCol: z.number().int().min(0).optional(),
  debitCol: z.number().int().min(0).optional(),
  creditCol: z.number().int().min(0).optional(),
  balanceCol: z.number().int().min(0).optional(),
  availableCol: z.number().int().min(0).optional(), // credit cards: available credit
  dateFormat: dateFormats,
  flipSign: z.boolean().optional(),
  // Row indexes (0-based, blank lines ignored). headerRow null = no header row.
  headerRow: z.number().int().min(0).nullable().optional(),
  dataStartRow: z.number().int().min(0).optional(),
  hasHeader: z.boolean().optional(), // legacy: mappings saved before headerRow existed
});

// First row of transactions, honouring mappings saved before headerRow existed.
function dataStartRow(mapping: z.infer<typeof mappingSchema>): number {
  if (mapping.dataStartRow !== undefined) return mapping.dataStartRow;
  const headerRow = mapping.headerRow !== undefined ? mapping.headerRow : mapping.hasHeader === false ? null : 0;
  return headerRow === null ? 0 : headerRow + 1;
}

const importSchema = z.object({
  csvs: z.array(z.string().min(1)).min(1),
  mapping: mappingSchema,
});

// Normalizes a variety of common bank export date formats to YYYY-MM-DD.
function normalizeDate(raw: string, format: z.infer<typeof dateFormats>): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (!m) return null;
  const [, a, b, cc] = m as [string, string, string, string];

  let year: string, month: string, day: string;
  if (format === "YMD") {
    [year, month, day] = [a, b, cc];
  } else if (format === "MDY") {
    [month, day, year] = [a, b, cc];
  } else {
    [day, month, year] = [a, b, cc];
  }
  if (year.length === 2) year = `20${year}`;
  if (year.length !== 4) return null;

  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  const date = new Date(`${year}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${year}-${mm}-${dd}`;
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/[^0-9.\-]/g, "")) || 0;
}

// Like parseAmount, but distinguishes an empty cell from a real 0.
function parseOptionalAmount(raw: string | undefined): number | null {
  if (!raw || !/\d/.test(raw)) return null;
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(n) ? null : n;
}

const DEBT_TYPES = new Set(["credit", "loan"]);

importRoutes.post("/accounts/:id/import", async (c) => {
  const accountId = c.req.param("id");
  const parsed = importSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const [account] = await query<{ type: string }>(`SELECT type FROM accounts WHERE account_id = $1`, [accountId]);
  if (!account) return c.json({ error: "Account not found" }, 404);

  const { csvs, mapping } = parsed.data;
  const isDebt = DEBT_TYPES.has(account.type);
  const toImport: TransactionInput[] = [];
  let skipped = 0;
  // Each file's rows in chronological order (oldest first), with the bank's
  // running balance / available credit when those columns are mapped.
  type FileRow = { date: string; amount: number; balance: number | null; available: number | null };
  const files: FileRow[][] = [];

  for (const csv of csvs) {
    const parsedRows: Array<TransactionInput & { balance: number | null; available: number | null }> = [];
    for (const row of parseCsv(csv).slice(dataStartRow(mapping))) {
      const date = normalizeDate(row[mapping.dateCol] ?? "", mapping.dateFormat);
      const name = (row[mapping.nameCol] ?? "").trim() || null;
      if (!date) {
        skipped++;
        continue;
      }

      let amount: number;
      if (mapping.debitCol !== undefined || mapping.creditCol !== undefined) {
        const debit = mapping.debitCol !== undefined ? parseAmount(row[mapping.debitCol] ?? "") : 0;
        const credit = mapping.creditCol !== undefined ? parseAmount(row[mapping.creditCol] ?? "") : 0;
        amount = debit - credit;
      } else {
        amount = parseAmount(row[mapping.amountCol ?? -1] ?? "");
        if (mapping.flipSign) amount = -amount;
      }

      const balance = mapping.balanceCol !== undefined ? parseOptionalAmount(row[mapping.balanceCol]) : null;
      const available = mapping.availableCol !== undefined ? parseOptionalAmount(row[mapping.availableCol]) : null;
      parsedRows.push({ accountId, name, amount, date, isoCurrency: null, category: null, balance, available });
    }

    // Banks list rows newest-first or oldest-first; normalize to oldest-first
    // so same-day rows keep the bank's order.
    const first = parsedRows[0];
    const last = parsedRows[parsedRows.length - 1];
    const chronological = first && last && first.date > last.date ? parsedRows.reverse() : parsedRows;
    for (const { balance: _, available: __, ...t } of chronological) toImport.push(t);
    files.push(chronological.map((r) => ({ date: r.date, amount: r.amount, balance: r.balance, available: r.available })));
  }

  if (toImport.length === 0) {
    return c.json({ error: "No rows with a valid date — check the date column and format" }, 400);
  }

  // Bank balance → our convention. Banks are positive-in-the-black; card and
  // loan balances may be shown as + owed or - owed, so go by the majority.
  const allBalances = files.flat().flatMap((r) => (r.balance === null || r.balance === 0 ? [] : [r.balance]));
  const owedShownNegative = isDebt && allBalances.filter((b) => b < 0).length > allBalances.length / 2;
  const toOurBalance = (b: number) => (owedShownNegative ? -b : b);
  // How a transaction should move our balance (amount is + for money out).
  const delta = (amount: number) => (isDebt ? amount : -amount);

  // Newest balance in the files becomes the account's anchor balance.
  let latest: { date: string; balance: number } | null = null;
  for (const rows of files) {
    for (const r of rows) {
      if (r.balance !== null && (!latest || r.date >= latest.date)) latest = { date: r.date, balance: toOurBalance(r.balance) };
    }
  }

  // Newest available credit in the files (credit cards only) sets the credit
  // limit: available + balance owed at that row.
  let latestAvailable: FileRow | null = null;
  if (account.type === "credit") {
    for (const rows of files) {
      for (const r of rows) {
        if (r.available !== null && (!latestAvailable || r.date >= latestAvailable.date)) latestAvailable = r;
      }
    }
  }

  // Balance check: each row's amount should explain the change in the bank's
  // running balance from the row before. Mismatches mean missing rows or
  // mis-mapped / mis-signed amount columns.
  let checked = 0;
  let mismatches = 0;
  let firstMismatchDate: string | null = null;
  for (const rows of files) {
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const cur = rows[i]!;
      if (prev.balance === null || cur.balance === null) continue;
      checked++;
      const change = toOurBalance(cur.balance) - toOurBalance(prev.balance);
      if (Math.abs(change - delta(cur.amount)) > 0.005) {
        mismatches++;
        firstMismatchDate ??= cur.date;
      }
    }
  }

  let creditLimit: number | null = null; // set if the file's available-credit column updated it

  // One transaction so a failed import leaves no partial rows behind.
  await withTransaction(async (client) => {
    for (const t of toImport) await upsertTransaction(t, client);
    await client.query(
      `UPDATE accounts
       SET import_mapping = $1,
           -- Re-anchor only if the file's balance is at least as recent as the
           -- one we have (an old statement must not undo a balance typed today).
           anchor_balance = CASE WHEN $3::date >= COALESCE(balance_as_of, '-infinity') THEN $2 ELSE anchor_balance END,
           balance_as_of = CASE WHEN $3::date >= COALESCE(balance_as_of, '-infinity') THEN $3::date ELSE balance_as_of END,
           updated_at = now()
       WHERE account_id = $4`,
      [JSON.stringify(mapping), latest?.balance ?? null, latest?.date ?? null, accountId],
    );

    if (latestAvailable) {
      // Balance owed at that row: from the file if it has one, otherwise the
      // account's balance at the end of that day.
      let owed: number;
      if (latestAvailable.balance !== null) {
        owed = toOurBalance(latestAvailable.balance);
      } else {
        const { rows } = await client.query<{ owed: number }>(
          `SELECT a.current_balance - COALESCE(SUM(${DELTA_SQL}) FILTER (WHERE t.date > $2::date), 0) AS owed
           FROM (${ACCOUNTS_SQL}) a LEFT JOIN transactions t ON t.account_id = a.account_id
           WHERE a.account_id = $1
           GROUP BY a.current_balance`,
          [accountId, latestAvailable.date],
        );
        owed = rows[0]!.owed;
      }
      creditLimit = Math.round((latestAvailable.available! + owed) * 100) / 100;
      await client.query(`UPDATE accounts SET credit_limit = $1 WHERE account_id = $2`, [creditLimit, accountId]);
    }
  });

  const [updated] = await query<{ current_balance: number }>(`${ACCOUNTS_SQL} WHERE a.account_id = $1`, [accountId]);

  return c.json({
    imported: toImport.length,
    skipped,
    files: csvs.length,
    balance: updated?.current_balance ?? null, // current balance after the import
    balanceDate: latest?.date ?? null, // set when the file's balance column re-anchored the account
    balanceCheck: checked > 0 ? { checked, mismatches, firstMismatchDate } : null,
    creditLimit,
    accountId,
  });
});

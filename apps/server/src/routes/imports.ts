import { Hono } from "hono";
import { z } from "zod";
import { query, withTransaction } from "../db/index.js";
import { upsertTransaction, type TransactionInput } from "../db/queries.js";

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
const PREVIEW_ROWS = 20;

// Returns the first rows raw so the user can pick which row holds the column
// names and where transactions start (some files have account info above the
// header, e.g. CTFS; some have no header at all, e.g. TD).
importRoutes.post("/accounts/:id/import-preview", async (c) => {
  const parsed = previewSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) return c.json({ error: "CSV file is empty" }, 400);

  const sample = rows.slice(0, PREVIEW_ROWS);
  return c.json({ rows: sample, columnCount: Math.max(...sample.map((r) => r.length)) });
});

const dateFormats = z.enum(["YMD", "MDY", "DMY"]);

const mappingSchema = z.object({
  dateCol: z.number().int().min(0),
  nameCol: z.number().int().min(0),
  amountCol: z.number().int().min(0).optional(),
  debitCol: z.number().int().min(0).optional(),
  creditCol: z.number().int().min(0).optional(),
  balanceCol: z.number().int().min(0).optional(),
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
  const toImport: TransactionInput[] = [];
  let skipped = 0;
  // Most recent running balance seen across all files, if a balance column is mapped.
  let latest: { date: string; balance: number } | null = null;

  for (const csv of csvs) {
    const rows = parseCsv(csv);
    const dataRows = rows.slice(dataStartRow(mapping));

    const parsedRows: Array<{ date: string; balance: number | null }> = [];
    for (const row of dataRows) {
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

      toImport.push({ accountId, name, amount, date, isoCurrency: null, category: null });
      const balance = mapping.balanceCol !== undefined ? parseOptionalAmount(row[mapping.balanceCol]) : null;
      parsedRows.push({ date, balance });
    }

    // Banks list rows newest-first or oldest-first. Walk in chronological
    // order so that, for same-day rows, the last one seen is that day's
    // closing balance.
    const first = parsedRows[0];
    const last = parsedRows[parsedRows.length - 1];
    const chronological = first && last && first.date > last.date ? [...parsedRows].reverse() : parsedRows;
    for (const r of chronological) {
      if (r.balance !== null && (!latest || r.date >= latest.date)) latest = { date: r.date, balance: r.balance };
    }
  }

  if (toImport.length === 0) {
    return c.json({ error: "No rows with a valid date — check the date column and format" }, 400);
  }

  // Debts are stored as a positive amount owed, whatever sign the bank uses.
  const newBalance = latest ? (DEBT_TYPES.has(account.type) ? Math.abs(latest.balance) : latest.balance) : null;

  // One transaction so a failed import leaves no partial rows behind.
  await withTransaction(async (client) => {
    for (const t of toImport) await upsertTransaction(t, client);
    await client.query(
      `UPDATE accounts
       SET import_mapping = $1,
           current_balance = COALESCE($2, current_balance),
           updated_at = now()
       WHERE account_id = $3`,
      [JSON.stringify(mapping), newBalance, accountId],
    );
  });

  return c.json({
    imported: toImport.length,
    skipped,
    files: csvs.length,
    balance: newBalance,
    balanceDate: latest?.date ?? null,
    accountId,
  });
});

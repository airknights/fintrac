import { Hono } from "hono";
import { z } from "zod";
import { upsertTransaction } from "../db/queries.js";

export const importRoutes = new Hono();

// Minimal RFC4180-subset CSV parser: handles quoted fields, embedded commas,
// and "" as an escaped quote. Good enough for bank export files.
function parseCsv(text: string): string[][] {
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
    } else if (ch === ",") {
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

importRoutes.post("/accounts/:id/import-preview", async (c) => {
  const parsed = previewSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) return c.json({ error: "CSV file is empty" }, 400);

  const [headers, ...dataRows] = rows;
  return c.json({ headers, rows: dataRows.slice(0, 5) });
});

const dateFormats = z.enum(["YMD", "MDY", "DMY"]);

const importSchema = z.object({
  csv: z.string().min(1),
  mapping: z.object({
    dateCol: z.number().int().min(0),
    nameCol: z.number().int().min(0),
    amountCol: z.number().int().min(0).optional(),
    debitCol: z.number().int().min(0).optional(),
    creditCol: z.number().int().min(0).optional(),
    dateFormat: dateFormats,
    flipSign: z.boolean().optional(),
  }),
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

importRoutes.post("/accounts/:id/import", async (c) => {
  const accountId = c.req.param("id");
  const parsed = importSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { csv, mapping } = parsed.data;
  const rows = parseCsv(csv);
  if (rows.length < 2) return c.json({ error: "CSV file has no data rows" }, 400);
  const dataRows = rows.slice(1); // skip header

  let imported = 0;
  const skipped: number[] = [];

  dataRows.forEach((row, i) => {
    const date = normalizeDate(row[mapping.dateCol] ?? "", mapping.dateFormat);
    const name = (row[mapping.nameCol] ?? "").trim() || null;
    if (!date) {
      skipped.push(i);
      return;
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

    upsertTransaction({ accountId, name, amount, date, isoCurrency: null, category: null });
    imported++;
  });

  return c.json({ imported, skipped: skipped.length, accountId });
});

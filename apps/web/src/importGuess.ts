import type { ImportMapping } from "./api/client.js";

// Best-guess CSV import settings, so most files need no manual mapping.

const DATE_RE = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/;
const AMOUNT_RE = /^\(?-?\$?\s?[\d,]*\.?\d+\)?$/;

const isDate = (cell: string) => DATE_RE.test(cell.trim());
const isAmount = (cell: string) => {
  const c = cell.trim();
  return c !== "" && !isDate(c) && AMOUNT_RE.test(c);
};
const amountValue = (cell: string) => {
  const c = cell.trim();
  const n = Number(c.replace(/[^0-9.\-]/g, ""));
  return c.startsWith("(") && c.endsWith(")") ? -Math.abs(n) : n;
};

// Header row: the first row filled across (nearly) every column whose cells
// are all text, i.e. no dates or amounts. Account-info lines above the header
// usually have only a cell or two. Returns null when the file has no header
// (e.g. TD): only rows *before* the first transaction can be the header.
export function guessHeaderRow(rows: string[][], columnCount: number): number | null {
  const minFilled = Math.max(2, Math.ceil(columnCount * 0.6));
  const firstData = rows.findIndex((r) => r.some(isDate));
  const candidates = firstData === -1 ? rows : rows.slice(0, firstData);
  const index = candidates.findIndex((r) => {
    const filled = r.filter((c) => c.trim());
    return filled.length >= minFilled && !filled.some((c) => isDate(c) || isAmount(c));
  });
  return index === -1 ? null : index;
}

// Header-name patterns, most specific first. Transaction date beats posted date.
const NAME_PATTERNS: Record<"date" | "name" | "amount" | "debit" | "credit" | "available" | "balance", RegExp[]> = {
  date: [/trans(action)?\.?\s*date/i, /^date$/i, /\bdate\b/i],
  name: [/description|details|narrative/i, /merchant|payee/i, /memo|name/i],
  amount: [/^amount$/i, /\bamount\b/i],
  debit: [/debit|withdraw|money out|paid out|charges?|purchases?|spent/i],
  credit: [/credit|deposit|money in|paid in|payments?|received/i],
  available: [/available/i],
  balance: [/balance/i],
};

function findByName(headers: string[], key: keyof typeof NAME_PATTERNS, taken: Set<number>): number | undefined {
  for (const pattern of NAME_PATTERNS[key]) {
    const i = headers.findIndex((h, idx) => !taken.has(idx) && pattern.test(h.trim()));
    if (i !== -1) return i;
  }
  return undefined;
}

export type ColumnGuess = Partial<ImportMapping> & { amountMode: "single" | "split" };

// creditCard: look for an available-credit column. For bank accounts an
// "Available Balance" column is just the balance.
export function guessColumns(
  headerCells: string[] | null,
  dataRows: string[][],
  columnCount: number,
  { creditCard = false }: { creditCard?: boolean } = {},
): ColumnGuess {
  const sample = dataRows.slice(0, 20);
  const col = (j: number) => sample.map((r) => r[j] ?? "");
  const share = (j: number, test: (c: string) => boolean) => {
    const cells = col(j);
    return cells.length ? cells.filter(test).length / cells.length : 0;
  };
  const filledShare = (j: number) => share(j, (c) => c.trim() !== "");
  const indexes = Array.from({ length: columnCount }, (_, j) => j);
  const taken = new Set<number>();
  const take = (i: number | undefined) => (i !== undefined && taken.add(i), i);

  const g: ColumnGuess = { amountMode: "single" };

  // 1. By header name.
  if (headerCells) {
    g.dateCol = take(findByName(headerCells, "date", taken));
    // Before balance, so a card's "Available Credit" / "Available Balance" isn't taken as the balance.
    if (creditCard) g.availableCol = take(findByName(headerCells, "available", taken));
    g.balanceCol = take(findByName(headerCells, "balance", taken));
    g.amountCol = take(findByName(headerCells, "amount", taken));
    if (g.amountCol === undefined) {
      g.debitCol = take(findByName(headerCells, "debit", taken));
      g.creditCol = take(findByName(headerCells, "credit", taken));
    }
    g.nameCol = take(findByName(headerCells, "name", taken));
  }

  // 2. Fill gaps from the data itself (also the whole job for header-less files).
  if (g.dateCol === undefined) {
    g.dateCol = take(indexes.find((j) => !taken.has(j) && share(j, isDate) >= 0.8));
  }
  if (g.nameCol === undefined) {
    // The text column with the longest values — descriptions beat short codes like "PURCHASE".
    // Skip masked card/account numbers ("4500********1234") and columns that
    // repeat one value on every row — neither is a description.
    const isCode = (c: string) => /^[\d*xX\s-]+$/.test(c.trim());
    const varied = (j: number) => sample.length < 2 || new Set(col(j).map((c) => c.trim())).size > 1;
    const textCols = indexes.filter(
      (j) =>
        !taken.has(j) &&
        varied(j) &&
        share(j, (c) => c.trim() !== "" && !isDate(c) && !isAmount(c) && !isCode(c)) >= 0.6,
    );
    const avgLen = (j: number) => col(j).reduce((s, c) => s + c.trim().length, 0) / Math.max(1, sample.length);
    g.nameCol = take(textCols.sort((a, b) => avgLen(b) - avgLen(a))[0]);
  }
  const noAmountYet = g.amountCol === undefined && g.debitCol === undefined && g.creditCol === undefined;
  if (noAmountYet) {
    // Number columns: fully-filled ones are an amount or running balance; sparse
    // ones (empty on some rows) are money-out / money-in pairs.
    const numeric = indexes.filter(
      (j) => !taken.has(j) && share(j, (c) => c.trim() === "" || isAmount(c)) >= 0.95 && share(j, isAmount) > 0,
    );
    const sparse = numeric.filter((j) => filledShare(j) < 0.95);
    const full = numeric.filter((j) => filledShare(j) >= 0.95);
    if (sparse.length >= 2) {
      // Bank exports list money out before money in (TD: Date, Description, Debit, Credit, Balance).
      g.debitCol = take(sparse[0]);
      g.creditCol = take(sparse[1]);
      if (g.balanceCol === undefined) g.balanceCol = take(full[full.length - 1]);
    } else if (full.length >= 1) {
      g.amountCol = take(full[0]);
      if (g.balanceCol === undefined && full.length >= 2) g.balanceCol = take(full[full.length - 1]);
    }
  }

  if (g.debitCol !== undefined || g.creditCol !== undefined) g.amountMode = "split";

  // 3. Date format: a 4-digit first part is year-first; a part over 12 must be the day.
  if (g.dateCol !== undefined) {
    const parts = col(g.dateCol)
      .map((c) => c.trim().match(DATE_RE))
      .filter((m): m is RegExpMatchArray => !!m);
    if (parts.some((m) => m[1]!.length === 4)) g.dateFormat = "YMD";
    else if (parts.some((m) => Number(m[1]) > 12)) g.dateFormat = "DMY";
    else g.dateFormat = "MDY"; // includes ambiguous dates; Canadian bank exports mostly use MM/DD/YYYY
  }

  // 4. Sign: most rows are spending. If most amounts are negative, the bank
  //    writes spending as negative and we need to flip (we store outflow as +).
  if (g.amountCol !== undefined) {
    const values = col(g.amountCol).filter(isAmount).map(amountValue);
    g.flipSign = values.filter((v) => v < 0).length > values.length / 2;
  }

  return g;
}

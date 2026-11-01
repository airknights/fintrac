// Thin fetch wrapper around the local backend (same-origin via Vite proxy).

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ── Response types ─────────────────────────────────────────────
export interface Account {
  account_id: string;
  name: string;
  institution_name: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null; // anchor_balance + transactions dated after balance_as_of
  anchor_balance: number;
  balance_as_of: string | null; // YYYY-MM-DD; null = no balance known yet
  credit_limit: number | null;
  available_credit: number | null; // credit_limit - current_balance (credit cards with a known limit)
  iso_currency: string;
  import_mapping: ImportMapping | null; // saved from the last CSV import
}

export interface NetWorth {
  assets: number;
  debts: number;
  netWorth: number;
  accountCount: number;
}

export interface SpendingResponse {
  days: number;
  total: number;
  byCategory: Array<{ category: string; total: number; count: number }>;
}

export interface DebtsResponse {
  totalDebt: number;
  debts: Array<{
    accountId: string;
    name: string;
    balance: number;
    apr: number | null;
    minimumPayment: number | null;
    needsInput: boolean;
  }>;
}

export interface PayoffResult {
  strategy: "avalanche" | "snowball";
  feasible: boolean;
  reason?: string;
  months: number;
  totalInterest: number;
  totalPaid: number;
  payoffOrder: Array<{ id: string; name: string; payoffMonth: number }>;
  schedule: Array<{ month: number; totalBalance: number }>;
}

export interface DebtPlanResponse {
  avalanche: PayoffResult;
  snowball: PayoffResult;
  interestSaved: number;
  monthsSaved: number;
  debtsUsed: number;
  needsInput: Array<{ accountId: string; name: string; balance: number }>;
}

export interface ImportPreview {
  rows: string[][]; // first rows of the file, raw (row 0 may or may not be a header)
  columnCount: number;
}

export interface ImportMapping {
  dateCol: number;
  nameCol: number;
  amountCol?: number;
  debitCol?: number;
  creditCol?: number;
  balanceCol?: number;
  availableCol?: number; // credit cards: available credit
  dateFormat: "YMD" | "MDY" | "DMY";
  flipSign?: boolean;
  // Row indexes into the file (0-based, blank lines ignored). headerRow null = no header row.
  headerRow?: number | null;
  dataStartRow?: number;
  hasHeader?: boolean; // legacy: mappings saved before headerRow existed
}

export interface ImportResult {
  imported: number;
  skipped: number;
  files: number;
  balance: number | null; // current balance after the import
  balanceDate: string | null; // set when the file's balance column updated the balance
  // Did each row's amount explain the change in the bank's running balance?
  balanceCheck: { checked: number; mismatches: number; firstMismatchDate: string | null } | null;
  creditLimit: number | null; // set when the file's available-credit column updated the limit
  accountId: string;
}

export interface Transaction {
  transaction_id: string;
  account_id: string;
  account_name: string;
  account_type: string;
  name: string | null;
  merchant_name: string | null;
  amount: number; // + = money out
  date: string;
  category: string | null;
  running_balance: number; // account balance after this transaction
}

export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
}

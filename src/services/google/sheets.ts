/**
 * Google Sheets API — called directly from the browser using the
 * OAuth access_token obtained in auth.ts. No server required.
 */
import type { Transaction, Account, Budget, Category } from '../../types'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

type SheetName = 'transactions' | 'accounts' | 'budgets' | 'categories'

const HEADERS: Record<SheetName, string[]> = {
  transactions: ['id','accountId','date','name','merchantName','amount','currency','category','pending','source','plaidTransactionId','logoUrl'],
  accounts:     ['id','institutionId','institutionName','name','type','balance','currency','mask','plaidAccountId'],
  budgets:      ['id','category','limitAmount','month','currency'],
  categories:   ['id','name','color'],
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function gFetch(url: string, method: string, token: string, body?: object) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error?.message ?? `Sheets API ${res.status}`)
  }
  return res.json()
}

// ── Spreadsheet setup ─────────────────────────────────────────────────────────

export async function createSpreadsheet(token: string): Promise<string> {
  const sheetNames = Object.keys(HEADERS) as SheetName[]

  const data = await gFetch(API, 'POST', token, {
    properties: { title: 'Fintrac' },
    sheets: sheetNames.map((name, i) => ({
      properties: { sheetId: i, title: name, index: i },
    })),
  })

  const sid: string = data.spreadsheetId

  // Write header rows
  const requests = sheetNames.map((name, i) => ({
    updateCells: {
      range: {
        sheetId: i,
        startRowIndex: 0, endRowIndex: 1,
        startColumnIndex: 0, endColumnIndex: HEADERS[name].length,
      },
      rows: [{
        values: HEADERS[name].map(h => ({ userEnteredValue: { stringValue: h } })),
      }],
      fields: 'userEnteredValue',
    },
  }))

  await gFetch(`${API}/${sid}:batchUpdate`, 'POST', token, { requests })
  return sid
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function readSheet<T extends object>(
  sid: string, sheet: SheetName, token: string
): Promise<T[]> {
  const data = await gFetch(`${API}/${sid}/values/${sheet}`, 'GET', token)
  const rows: string[][] = data.values ?? []
  if (rows.length < 2) return []
  const [headers, ...dataRows] = rows
  return dataRows
    .filter(r => r.some(Boolean))
    .map(row => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
      return obj as unknown as T
    })
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function appendRow(
  sid: string, sheet: SheetName,
  row: (string | number | boolean)[],
  token: string
) {
  await gFetch(
    `${API}/${sid}/values/${sheet}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    'POST', token,
    { values: [row] }
  )
}

export async function rewriteSheet(
  sid: string, sheet: SheetName,
  rows: (string | number | boolean)[][],
  token: string
) {
  // Clear all data rows (A2 onwards) then write fresh
  await gFetch(`${API}/${sid}/values/${sheet}!A2:Z?valueInputOption=RAW`, 'PUT', token, {
    values: rows.length ? rows : [Array(HEADERS[sheet].length).fill('')],
  })
}

// ── Serialisers ───────────────────────────────────────────────────────────────

export function txnToRow(t: Transaction): (string | number | boolean)[] {
  return [
    t.id, t.accountId, t.date, t.name, t.merchantName ?? '',
    t.amount, t.currency, t.category, t.pending,
    t.source, t.plaidTransactionId ?? '', t.logoUrl ?? '',
  ]
}

export function rowToTxn(o: Record<string, string>): Transaction {
  return {
    id: o.id,
    accountId: o.accountId,
    date: o.date,
    name: o.name,
    merchantName: o.merchantName || undefined,
    amount: parseFloat(o.amount) || 0,
    currency: o.currency || 'CAD',
    category: o.category || 'Other',
    pending: o.pending === 'true',
    source: (o.source as Transaction['source']) || 'manual',
    plaidTransactionId: o.plaidTransactionId || undefined,
    logoUrl: o.logoUrl || undefined,
  }
}

export function accountToRow(a: Account): (string | number | boolean)[] {
  return [
    a.id, a.institutionId ?? '', a.institutionName ?? '',
    a.name, a.type, a.balance, a.currency, a.mask ?? '', a.plaidAccountId ?? '',
  ]
}

export function rowToAccount(o: Record<string, string>): Account {
  return {
    id: o.id,
    institutionId: o.institutionId || undefined,
    institutionName: o.institutionName || undefined,
    name: o.name,
    type: (o.type as Account['type']) || 'chequing',
    balance: parseFloat(o.balance) || 0,
    currency: o.currency || 'CAD',
    mask: o.mask || undefined,
    plaidAccountId: o.plaidAccountId || undefined,
  }
}

export function budgetToRow(b: Budget): (string | number | boolean)[] {
  return [b.id, b.category, b.limitAmount, b.month, b.currency]
}

export function rowToBudget(o: Record<string, string>): Budget {
  return {
    id: o.id,
    category: o.category,
    limitAmount: parseFloat(o.limitAmount) || 0,
    month: o.month,
    currency: o.currency || 'CAD',
  }
}

export function categoryToRow(c: Category): (string | number | boolean)[] {
  return [c.id, c.name, c.color]
}

export function rowToCategory(o: Record<string, string>): Category {
  return { id: o.id, name: o.name, color: o.color }
}

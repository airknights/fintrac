/**
 * Plaid API client — all calls go through the Cloudflare Worker proxy.
 * The Worker adds client_id + secret before forwarding to Plaid.
 * Transaction data flows: Browser → Plaid → Browser (proxy not involved in data).
 */
import type { Transaction, Account } from '../../types'
import { PLAID_CATEGORY_MAP } from '../db/dexie'
import { v4 as uuidv4 } from 'uuid'

const WORKER = import.meta.env.VITE_CF_WORKER_URL as string

async function call<T = unknown>(path: string, body: object): Promise<T> {
  if (!WORKER) throw new Error('VITE_CF_WORKER_URL is not set — add it to .env')
  const res = await fetch(`${WORKER}/plaid${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as any
  if (data.error_code) throw new Error(`Plaid: ${data.error_message ?? data.error_code}`)
  return data as T
}

// ── Link token (starts the Plaid Link UI flow) ────────────────────────────────

export async function createLinkToken(userId: string): Promise<string> {
  const data = await call<{ link_token: string }>('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'Fintrac',
    products: ['transactions'],
    country_codes: ['CA', 'US'],
    language: 'en',
  })
  return data.link_token
}

// ── Token exchange (public_token → access_token) ──────────────────────────────

export async function exchangeToken(publicToken: string): Promise<string> {
  const data = await call<{ access_token: string }>('/item/public_token/exchange', {
    public_token: publicToken,
  })
  return data.access_token
}

// ── Fetch accounts for a linked item ─────────────────────────────────────────

export async function fetchPlaidAccounts(
  accessToken: string
): Promise<{ plaidAccountId: string; name: string; mask: string; type: string; subtype: string; balance: number }[]> {
  const data = await call<{ accounts: any[] }>('/accounts/get', {
    access_token: accessToken,
  })
  return data.accounts.map(a => ({
    plaidAccountId: a.account_id,
    name: a.name,
    mask: a.mask ?? '',
    type: a.type,
    subtype: a.subtype ?? '',
    balance: a.balances?.current ?? 0,
  }))
}

// ── Sync transactions (uses Plaid /transactions/sync) ─────────────────────────

interface SyncResult {
  added: Transaction[]
  modified: Transaction[]
  removedIds: string[]
  nextCursor: string
}

export async function syncTransactions(
  accessToken: string,
  accountId: string,           // local Account.id to attach transactions to
  cursor?: string
): Promise<SyncResult> {
  let added: any[] = []
  let modified: any[] = []
  let removed: any[] = []
  let nextCursor = cursor ?? ''
  let hasMore = true

  while (hasMore) {
    const body: Record<string, unknown> = { access_token: accessToken }
    if (nextCursor) body.cursor = nextCursor

    const data = await call<{
      added: any[]; modified: any[]; removed: any[]
      has_more: boolean; next_cursor: string
    }>('/transactions/sync', body)

    added    = [...added,    ...data.added]
    modified = [...modified, ...data.modified]
    removed  = [...removed,  ...data.removed]
    nextCursor = data.next_cursor
    hasMore = data.has_more
  }

  const toTxn = (p: any): Transaction => ({
    id: uuidv4(),
    accountId,
    date: p.date,
    name: p.name,
    merchantName: p.merchant_name ?? undefined,
    amount: p.amount,      // Plaid: positive = debit (expense), negative = credit
    currency: p.iso_currency_code ?? 'CAD',
    category: PLAID_CATEGORY_MAP[p.personal_finance_category?.primary ?? ''] ?? 'Other',
    pending: p.pending ?? false,
    source: 'plaid',
    plaidTransactionId: p.transaction_id,
    logoUrl: p.logo_url ?? undefined,
  })

  return {
    added:      added.map(toTxn),
    modified:   modified.map(toTxn),
    removedIds: removed.map((r: any) => r.transaction_id),
    nextCursor,
  }
}

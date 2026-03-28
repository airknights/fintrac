/**
 * useSync — orchestrates the full sync pipeline:
 *   1. Pull latest data from Google Sheets → IndexedDB (on login / mount)
 *   2. Push local changes to Google Sheets (after writes)
 *   3. Pull Plaid transactions for all linked accounts
 */
import { useCallback, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { useTransactionStore } from '../store/useTransactionStore'
import { useAccountStore } from '../store/useAccountStore'
import { useBudgetStore } from '../store/useBudgetStore'
import * as sheets from '../services/google/sheets'
import { syncTransactions as plaidSync } from '../services/plaid/client'
import { db } from '../services/db/dexie'

export interface SyncState {
  syncing: boolean
  lastSync: Date | null
  error: string | null
}

export function useSync() {
  const [state, setState] = useState<SyncState>({
    syncing: false,
    lastSync: null,
    error: null,
  })

  const auth = useAuthStore()
  const txnStore = useTransactionStore()
  const accStore = useAccountStore()
  const budgetStore = useBudgetStore()

  // ── Pull from Google Sheets → IndexedDB ─────────────────────────────────────
  const pullFromSheets = useCallback(async () => {
    if (!auth.isTokenValid() || !auth.spreadsheetId) return
    const { accessToken, spreadsheetId } = auth
    if (!accessToken) return

    const [rawTxns, rawAccs, rawBudgets, rawCats] = await Promise.all([
      sheets.readSheet<Record<string,string>>(spreadsheetId, 'transactions', accessToken),
      sheets.readSheet<Record<string,string>>(spreadsheetId, 'accounts', accessToken),
      sheets.readSheet<Record<string,string>>(spreadsheetId, 'budgets', accessToken),
      sheets.readSheet<Record<string,string>>(spreadsheetId, 'categories', accessToken),
    ])

    await Promise.all([
      db.transactions.bulkPut(rawTxns.map(sheets.rowToTxn)),
      db.accounts.bulkPut(rawAccs.map(sheets.rowToAccount)),
      db.budgets.bulkPut(rawBudgets.map(sheets.rowToBudget)),
      db.categories.bulkPut(rawCats.map(sheets.rowToCategory)),
    ])

    await Promise.all([txnStore.load(), accStore.load(), budgetStore.load()])
  }, [auth, txnStore, accStore, budgetStore])

  // ── Push IndexedDB → Google Sheets ──────────────────────────────────────────
  const pushToSheets = useCallback(async () => {
    if (!auth.isTokenValid() || !auth.spreadsheetId) return
    const { accessToken, spreadsheetId } = auth
    if (!accessToken) return

    const [txns, accs, budgets, cats] = await Promise.all([
      db.transactions.toArray(),
      db.accounts.toArray(),
      db.budgets.toArray(),
      db.categories.toArray(),
    ])

    await Promise.all([
      sheets.rewriteSheet(spreadsheetId, 'transactions', txns.map(sheets.txnToRow), accessToken),
      sheets.rewriteSheet(spreadsheetId, 'accounts', accs.map(sheets.accountToRow), accessToken),
      sheets.rewriteSheet(spreadsheetId, 'budgets', budgets.map(sheets.budgetToRow), accessToken),
      sheets.rewriteSheet(spreadsheetId, 'categories', cats.map(sheets.categoryToRow), accessToken),
    ])
  }, [auth])

  // ── Pull Plaid transactions for all linked accounts ──────────────────────────
  const pullFromPlaid = useCallback(async () => {
    const accounts = await db.accounts.toArray()
    const plaidAccounts = accounts.filter(a => a.plaidAccessToken)

    for (const account of plaidAccounts) {
      const result = await plaidSync(account.plaidAccessToken!, account.id, account.plaidCursor)
      await txnStore.upsertMany(result.added)
      await txnStore.upsertMany(result.modified)
      await txnStore.removeByIds(result.removedIds)

      // Update cursor
      await db.accounts.update(account.id, { plaidCursor: result.nextCursor })
    }

    if (plaidAccounts.length) await accStore.load()
  }, [txnStore, accStore])

  // ── Full sync ────────────────────────────────────────────────────────────────
  const sync = useCallback(async () => {
    setState(s => ({ ...s, syncing: true, error: null }))
    try {
      await pullFromPlaid()
      await pushToSheets()
      setState({ syncing: false, lastSync: new Date(), error: null })
    } catch (err: any) {
      setState(s => ({ ...s, syncing: false, error: err.message }))
    }
  }, [pullFromPlaid, pushToSheets])

  return { ...state, sync, pullFromSheets, pushToSheets }
}

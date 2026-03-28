import { create } from 'zustand'
import { db } from '../services/db/dexie'
import type { Transaction } from '../types'

interface TransactionState {
  transactions: Transaction[]
  loading: boolean

  load: () => Promise<void>
  add: (t: Transaction) => Promise<void>
  update: (t: Transaction) => Promise<void>
  remove: (id: string) => Promise<void>
  importMany: (ts: Transaction[]) => Promise<{ added: number; skipped: number }>
  upsertMany: (ts: Transaction[]) => Promise<void>
  removeByIds: (ids: string[]) => Promise<void>
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  loading: false,

  async load() {
    set({ loading: true })
    const transactions = await db.transactions.orderBy('date').reverse().toArray()
    set({ transactions, loading: false })
  },

  async add(t) {
    await db.transactions.put(t)
    await get().load()
  },

  async update(t) {
    await db.transactions.put(t)
    await get().load()
  },

  async remove(id) {
    await db.transactions.delete(id)
    set(s => ({ transactions: s.transactions.filter(t => t.id !== id) }))
  },

  async importMany(ts) {
    const existingIds = new Set(
      (await db.transactions.toCollection().primaryKeys()) as string[]
    )
    const newOnes = ts.filter(t => !existingIds.has(t.id))
    if (newOnes.length) {
      await db.transactions.bulkAdd(newOnes)
      await get().load()
    }
    return { added: newOnes.length, skipped: ts.length - newOnes.length }
  },

  async upsertMany(ts) {
    if (ts.length) {
      await db.transactions.bulkPut(ts)
      await get().load()
    }
  },

  async removeByIds(ids) {
    if (ids.length) {
      await db.transactions.bulkDelete(ids)
      set(s => ({ transactions: s.transactions.filter(t => !ids.includes(t.id)) }))
    }
  },
}))

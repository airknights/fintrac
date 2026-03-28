import { create } from 'zustand'
import { db } from '../services/db/dexie'
import type { Account } from '../types'

interface AccountState {
  accounts: Account[]
  loading: boolean

  load: () => Promise<void>
  add: (a: Account) => Promise<void>
  update: (a: Account) => Promise<void>
  remove: (id: string) => Promise<void>
  upsertMany: (as: Account[]) => Promise<void>
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  loading: false,

  async load() {
    set({ loading: true })
    const accounts = await db.accounts.toArray()
    set({ accounts, loading: false })
  },

  async add(a) {
    await db.accounts.put(a)
    await get().load()
  },

  async update(a) {
    await db.accounts.put(a)
    await get().load()
  },

  async remove(id) {
    await db.accounts.delete(id)
    set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
  },

  async upsertMany(as) {
    if (as.length) {
      await db.accounts.bulkPut(as)
      await get().load()
    }
  },
}))

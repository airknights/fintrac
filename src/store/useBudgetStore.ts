import { create } from 'zustand'
import { db } from '../services/db/dexie'
import type { Budget, Category } from '../types'

interface BudgetState {
  budgets: Budget[]
  categories: Category[]
  loading: boolean

  load: () => Promise<void>
  addBudget: (b: Budget) => Promise<void>
  updateBudget: (b: Budget) => Promise<void>
  removeBudget: (id: string) => Promise<void>
  addCategory: (c: Category) => Promise<void>
  updateCategory: (c: Category) => Promise<void>
  removeCategory: (id: string) => Promise<void>
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  budgets: [],
  categories: [],
  loading: false,

  async load() {
    set({ loading: true })
    const [budgets, categories] = await Promise.all([
      db.budgets.toArray(),
      db.categories.orderBy('name').toArray(),
    ])
    set({ budgets, categories, loading: false })
  },

  async addBudget(b) {
    await db.budgets.put(b)
    await get().load()
  },

  async updateBudget(b) {
    await db.budgets.put(b)
    await get().load()
  },

  async removeBudget(id) {
    await db.budgets.delete(id)
    set(s => ({ budgets: s.budgets.filter(b => b.id !== id) }))
  },

  async addCategory(c) {
    await db.categories.put(c)
    await get().load()
  },

  async updateCategory(c) {
    await db.categories.put(c)
    await get().load()
  },

  async removeCategory(id) {
    await db.categories.delete(id)
    set(s => ({ categories: s.categories.filter(c => c.id !== id) }))
  },
}))

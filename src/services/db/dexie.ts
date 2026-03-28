import Dexie, { type Table } from 'dexie'
import type { Transaction, Account, Budget, Category } from '../../types'

export class FintracDB extends Dexie {
  transactions!: Table<Transaction>
  accounts!: Table<Account>
  budgets!: Table<Budget>
  categories!: Table<Category>

  constructor() {
    super('fintrac')
    this.version(1).stores({
      transactions: 'id, accountId, date, category, pending',
      accounts: 'id, plaidAccountId',
      budgets: 'id, [category+month]',
      categories: 'id, name',
    })
  }
}

export const db = new FintracDB()

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food',        name: 'Food & Dining',      color: '#f97316' },
  { id: 'transport',   name: 'Transportation',      color: '#3b82f6' },
  { id: 'entertain',   name: 'Entertainment',       color: '#a855f7' },
  { id: 'shopping',    name: 'Shopping',            color: '#06b6d4' },
  { id: 'bills',       name: 'Bills & Utilities',   color: '#84cc16' },
  { id: 'health',      name: 'Healthcare',          color: '#ef4444' },
  { id: 'personal',    name: 'Personal Care',       color: '#ec4899' },
  { id: 'travel',      name: 'Travel',              color: '#f59e0b' },
  { id: 'education',   name: 'Education',           color: '#8b5cf6' },
  { id: 'savings',     name: 'Savings',             color: '#22c55e' },
  { id: 'income',      name: 'Income',              color: '#10b981' },
  { id: 'transfers',   name: 'Transfers',           color: '#6366f1' },
  { id: 'other',       name: 'Other',               color: '#64748b' },
]

export async function seedCategories() {
  const count = await db.categories.count()
  if (count === 0) await db.categories.bulkAdd(DEFAULT_CATEGORIES)
}

// Map Plaid personal_finance_category.primary → local category name
export const PLAID_CATEGORY_MAP: Record<string, string> = {
  FOOD_AND_DRINK:          'Food & Dining',
  TRANSPORTATION:          'Transportation',
  ENTERTAINMENT:           'Entertainment',
  GENERAL_MERCHANDISE:     'Shopping',
  RENT_AND_UTILITIES:      'Bills & Utilities',
  MEDICAL:                 'Healthcare',
  PERSONAL_CARE:           'Personal Care',
  TRAVEL:                  'Travel',
  EDUCATION:               'Education',
  TRANSFER_IN:             'Transfers',
  TRANSFER_OUT:            'Transfers',
  LOAN_PAYMENTS:           'Bills & Utilities',
  BANK_FEES:               'Bills & Utilities',
  INCOME:                  'Income',
  GOVERNMENT_AND_NON_PROFIT: 'Other',
  HOME_IMPROVEMENT:        'Shopping',
  GENERAL_SERVICES:        'Other',
}

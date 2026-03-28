export interface Transaction {
  id: string
  accountId: string
  date: string          // YYYY-MM-DD
  name: string
  merchantName?: string
  amount: number        // positive = expense, negative = income / refund
  currency: string
  category: string
  pending: boolean
  source: 'plaid' | 'manual' | 'import'
  plaidTransactionId?: string
  logoUrl?: string
}

export interface Account {
  id: string
  institutionId?: string
  institutionName?: string
  name: string
  type: 'chequing' | 'savings' | 'credit' | 'investment' | 'loan' | 'other'
  balance: number
  currency: string
  mask?: string
  // Plaid fields — stored in localStorage only, never in Google Sheets
  plaidAccountId?: string
  plaidAccessToken?: string
  plaidCursor?: string
}

export interface Budget {
  id: string
  category: string
  limitAmount: number
  month: string         // YYYY-MM
  currency: string
}

export interface Category {
  id: string
  name: string
  color: string
}

export interface SyncStatus {
  lastSync: string | null   // ISO timestamp
  syncing: boolean
  error: string | null
}

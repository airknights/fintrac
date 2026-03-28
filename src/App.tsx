import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import { ToastProvider } from './components/ui/Toast'
import Dashboard    from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Accounts     from './pages/Accounts'
import Budgets      from './pages/Budgets'
import Settings     from './pages/Settings'
import { useTransactionStore } from './store/useTransactionStore'
import { useAccountStore }     from './store/useAccountStore'
import { useBudgetStore }      from './store/useBudgetStore'
import { useAuthStore }        from './store/useAuthStore'
import { useSync }             from './hooks/useSync'

function AppInner() {
  const loadTxns    = useTransactionStore(s => s.load)
  const loadAccs    = useAccountStore(s => s.load)
  const loadBudgets = useBudgetStore(s => s.load)
  const auth        = useAuthStore()
  const { pullFromSheets } = useSync()

  // Bootstrap: load local IndexedDB data on mount
  useEffect(() => {
    loadTxns()
    loadAccs()
    loadBudgets()
  }, [])

  // Pull from Google Sheets whenever the user signs in
  useEffect(() => {
    if (auth.isTokenValid() && auth.spreadsheetId) {
      pullFromSheets().catch(console.error)
    }
  }, [auth.accessToken])

  return (
    <div className="flex h-screen bg-zinc-950 text-gray-100 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/"             element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"    element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/accounts"     element={<Accounts />} />
            <Route path="/budgets"      element={<Budgets />} />
            <Route path="/settings"     element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </BrowserRouter>
  )
}

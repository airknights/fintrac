import { useState, useMemo } from 'react'
import { useTransactionStore } from '../store/useTransactionStore'
import { useBudgetStore } from '../store/useBudgetStore'
import { useAccountStore } from '../store/useAccountStore'
import { useSync } from '../hooks/useSync'
import { useToast } from '../components/ui/Toast'
import TransactionTable from '../components/transactions/TransactionTable'
import TransactionForm from '../components/transactions/TransactionForm'
import ImportWizard from '../components/transactions/ImportWizard'
import Button from '../components/ui/Button'
import type { Transaction } from '../types'

const PAGE = 50

export default function Transactions() {
  const { transactions, add, update, remove } = useTransactionStore()
  const { categories } = useBudgetStore()
  const { accounts } = useAccountStore()
  const { sync, syncing } = useSync()
  const { toast } = useToast()

  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [accFilter, setAccFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [page, setPage]           = useState(0)
  const [editing, setEditing]     = useState<Transaction | null>(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [showImport, setShowImport] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return transactions.filter(t => {
      if (q && !t.name.toLowerCase().includes(q) && !(t.merchantName?.toLowerCase().includes(q))) return false
      if (catFilter && t.category !== catFilter) return false
      if (accFilter && t.accountId !== accFilter) return false
      if (startDate && t.date < startDate) return false
      if (endDate && t.date > endDate) return false
      return true
    })
  }, [transactions, search, catFilter, accFilter, startDate, endDate])

  const pageCount  = Math.ceil(filtered.length / PAGE)
  const paginated  = filtered.slice(page * PAGE, (page + 1) * PAGE)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    await remove(id)
    toast('Transaction deleted', 'info')
  }

  const handleSave = async (t: Transaction) => {
    if (editing) { await update(t); toast('Transaction updated', 'success') }
    else          { await add(t);    toast('Transaction added', 'success') }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>↑ Import CSV</Button>
          <Button variant="secondary" size="sm" onClick={sync} loading={syncing}>⟳ Sync Banks</Button>
          <Button size="sm" onClick={() => { setEditing(null); setShowAdd(true) }}>+ Add</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 col-span-2 md:col-span-1"
        />
        <input
          type="date"
          value={startDate}
          onChange={e => { setStartDate(e.target.value); setPage(0) }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
        <input
          type="date"
          value={endDate}
          onChange={e => { setEndDate(e.target.value); setPage(0) }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
        <select
          value={catFilter}
          onChange={e => { setCatFilter(e.target.value); setPage(0) }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select
          value={accFilter}
          onChange={e => { setAccFilter(e.target.value); setPage(0) }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <TransactionTable
          transactions={paginated}
          onEdit={t => { setEditing(t); setShowAdd(true) }}
          onDelete={handleDelete}
        />
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{filtered.length} transactions</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</Button>
            <span className="px-3 py-1.5 text-xs">{page + 1} / {pageCount}</span>
            <Button variant="secondary" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}>Next →</Button>
          </div>
        </div>
      )}

      <TransactionForm
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditing(null) }}
        onSave={handleSave}
        initial={editing}
      />
      <ImportWizard open={showImport} onClose={() => setShowImport(false)} />
    </div>
  )
}

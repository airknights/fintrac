import { useState, useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { format, subMonths, addMonths } from 'date-fns'
import { useTransactionStore } from '../store/useTransactionStore'
import { useBudgetStore } from '../store/useBudgetStore'
import { useToast } from '../components/ui/Toast'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import type { Budget } from '../types'

const fmtCAD = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

export default function Budgets() {
  const [date, setDate] = useState(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [editBudget, setEditBudget] = useState<Budget | null>(null)
  const { budgets, categories, addBudget, updateBudget, removeBudget } = useBudgetStore()
  const { transactions } = useTransactionStore()
  const { toast } = useToast()

  const monthStr = format(date, 'yyyy-MM')
  const monthBudgets = budgets.filter(b => b.month === monthStr)

  const spendByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of transactions) {
      if (t.pending || !t.date.startsWith(monthStr) || t.amount <= 0) continue
      map[t.category] = (map[t.category] ?? 0) + t.amount
    }
    return map
  }, [transactions, monthStr])

  const totalBudgeted = monthBudgets.reduce((s, b) => s + b.limitAmount, 0)
  const totalSpent    = monthBudgets.reduce((s, b) => s + (spendByCategory[b.category] ?? 0), 0)

  const canNext = addMonths(date, 1) <= new Date()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Budgets</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
            <button onClick={() => setDate(d => subMonths(d, 1))} className="text-gray-400 hover:text-white w-5">←</button>
            <span className="text-sm font-medium w-28 text-center">{format(date, 'MMMM yyyy')}</span>
            <button onClick={() => canNext && setDate(d => addMonths(d, 1))}
              className={`w-5 transition-colors ${canNext ? 'text-gray-400 hover:text-white' : 'text-gray-700 cursor-default'}`}>→</button>
          </div>
          <Button size="sm" onClick={() => { setEditBudget(null); setShowAdd(true) }}>+ Add Budget</Button>
        </div>
      </div>

      {/* Summary */}
      {monthBudgets.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Budgeted', value: fmtCAD(totalBudgeted), color: 'text-indigo-400' },
            { label: 'Spent',    value: fmtCAD(totalSpent),    color: 'text-red-400'    },
            { label: 'Remaining',value: fmtCAD(totalBudgeted - totalSpent), color: totalSpent <= totalBudgeted ? 'text-emerald-400' : 'text-red-400' },
          ].map(c => (
            <Card key={c.label}>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Budget cards */}
      {monthBudgets.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-sm text-center py-8">
            No budgets set for {format(date, 'MMMM yyyy')}. Add one to start tracking.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {monthBudgets.map(b => {
            const spent = spendByCategory[b.category] ?? 0
            const pct   = Math.min(spent / b.limitAmount * 100, 100)
            const over  = spent > b.limitAmount
            const warn  = spent > b.limitAmount * 0.75
            const color = over ? '#ef4444' : warn ? '#f59e0b' : '#22c55e'
            const cat   = categories.find(c => c.name === b.category)

            return (
              <Card key={b.id}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: cat?.color ?? '#64748b' }} />
                    <span className="text-sm font-medium text-gray-200">{b.category}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditBudget(b); setShowAdd(true) }}
                      className="text-gray-600 hover:text-gray-300 text-xs px-1">✎</button>
                    <button onClick={async () => { await removeBudget(b.id); toast('Budget removed', 'info') }}
                      className="text-gray-600 hover:text-red-400 text-xs px-1">✕</button>
                  </div>
                </div>

                <div className="flex justify-between text-sm mb-2">
                  <span className={over ? 'text-red-400 font-medium' : 'text-gray-300'}>{fmtCAD(spent)}</span>
                  <span className="text-gray-500">/ {fmtCAD(b.limitAmount)}</span>
                </div>

                <div className="bg-zinc-800 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>

                <p className="text-xs mt-2" style={{ color }}>
                  {over
                    ? `Over budget by ${fmtCAD(spent - b.limitAmount)}`
                    : `${fmtCAD(b.limitAmount - spent)} remaining (${(100 - pct).toFixed(0)}%)`}
                </p>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      <BudgetModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditBudget(null) }}
        onSave={async (b) => {
          if (editBudget) { await updateBudget(b); toast('Budget updated', 'success') }
          else            { await addBudget(b);    toast('Budget added', 'success')   }
        }}
        initial={editBudget}
        monthStr={monthStr}
        categories={categories.map(c => c.name)}
        existingCategories={monthBudgets.map(b => b.category).filter(c => c !== editBudget?.category)}
      />
    </div>
  )
}

function BudgetModal({ open, onClose, onSave, initial, monthStr, categories, existingCategories }: {
  open: boolean; onClose: () => void; onSave: (b: Budget) => void
  initial: Budget | null; monthStr: string
  categories: string[]; existingCategories: string[]
}) {
  const available = categories.filter(c => !existingCategories.includes(c))
  const [form, setForm] = useState<Partial<Budget>>(() => initial ?? {
    id: uuidv4(), category: available[0] ?? '', limitAmount: 0, month: monthStr, currency: 'CAD',
  })

  const set = (k: keyof Budget, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Budget' : 'Add Budget'}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
            {(initial ? categories : available).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Monthly Limit (CAD)</label>
          <input type="number" step="10" value={form.limitAmount ?? 0}
            onChange={e => set('limitAmount', parseFloat(e.target.value) || 0)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave({ ...form, month: monthStr } as Budget); onClose() }}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}

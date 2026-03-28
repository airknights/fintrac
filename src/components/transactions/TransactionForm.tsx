import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { useAccountStore } from '../../store/useAccountStore'
import { useBudgetStore } from '../../store/useBudgetStore'
import type { Transaction } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (t: Transaction) => void
  initial?: Transaction | null
}

const today = () => new Date().toISOString().slice(0, 10)

export default function TransactionForm({ open, onClose, onSave, initial }: Props) {
  const { accounts } = useAccountStore()
  const { categories } = useBudgetStore()

  const [form, setForm] = useState<Partial<Transaction>>(() => initial ?? {
    id: uuidv4(),
    date: today(),
    name: '',
    amount: 0,
    currency: 'CAD',
    category: 'Other',
    pending: false,
    source: 'manual',
    accountId: accounts[0]?.id ?? '',
  })

  const set = (k: keyof Transaction, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.date || !form.accountId) return
    onSave(form as Transaction)
    onClose()
  }

  const isExpense = (form.amount ?? 0) >= 0

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Transaction' : 'Add Transaction'}>
      <div className="space-y-4">
        {/* Date + Account */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={form.date ?? ''}
              onChange={e => set('date', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Account</label>
            <select
              value={form.accountId ?? ''}
              onChange={e => set('accountId', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <input
            type="text"
            value={form.name ?? ''}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Tim Hortons"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Amount + Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Amount (CAD)</label>
            <input
              type="number"
              step="0.01"
              value={Math.abs(form.amount ?? 0)}
              onChange={e => {
                const abs = parseFloat(e.target.value) || 0
                set('amount', isExpense ? abs : -abs)
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select
              value={isExpense ? 'expense' : 'income'}
              onChange={e => {
                const abs = Math.abs(form.amount ?? 0)
                set('amount', e.target.value === 'expense' ? abs : -abs)
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Category</label>
          <select
            value={form.category ?? 'Other'}
            onChange={e => set('category', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}

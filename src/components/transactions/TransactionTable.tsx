import { useBudgetStore } from '../../store/useBudgetStore'
import { useAccountStore } from '../../store/useAccountStore'
import type { Transaction } from '../../types'

interface Props {
  transactions: Transaction[]
  onEdit: (t: Transaction) => void
  onDelete: (id: string) => void
}

const fmt = (n: number, cur = 'CAD') =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: cur }).format(Math.abs(n))

const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

export default function TransactionTable({ transactions, onEdit, onDelete }: Props) {
  const { categories } = useBudgetStore()
  const { accounts } = useAccountStore()
  const colorMap = Object.fromEntries(categories.map(c => [c.name, c.color]))
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]))

  if (!transactions.length) {
    return (
      <div className="text-center py-16 text-gray-600 text-sm">
        No transactions yet. Import a CSV or connect a bank account.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            {['Date', 'Description', 'Account', 'Category', 'Amount', ''].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider first:pl-0 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map(t => {
            const isExpense = t.amount > 0
            return (
              <tr
                key={t.id}
                className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors group"
              >
                <td className="px-4 py-3 pl-0 text-gray-400 whitespace-nowrap">
                  {fmtDate(t.date)}
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <div className="text-gray-100 truncate">{t.merchantName || t.name}</div>
                  {t.merchantName && t.merchantName !== t.name && (
                    <div className="text-xs text-gray-600 truncate">{t.name}</div>
                  )}
                  {t.pending && (
                    <span className="text-xs text-amber-400">Pending</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {accountMap[t.accountId] ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {t.category ? (
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{
                        background: (colorMap[t.category] ?? '#64748b') + '22',
                        color: colorMap[t.category] ?? '#94a3b8',
                      }}
                    >
                      {t.category}
                    </span>
                  ) : (
                    <span className="text-gray-700 text-xs">—</span>
                  )}
                </td>
                <td className={`px-4 py-3 font-medium tabular-nums text-right whitespace-nowrap ${isExpense ? 'text-red-400' : 'text-emerald-400'}`}>
                  {isExpense ? '-' : '+'}{fmt(t.amount, t.currency)}
                </td>
                <td className="px-4 py-3 pr-0">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                    <button
                      onClick={() => onEdit(t)}
                      className="text-gray-500 hover:text-gray-300 px-2 py-1 rounded"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => onDelete(t.id)}
                      className="text-gray-500 hover:text-red-400 px-2 py-1 rounded"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

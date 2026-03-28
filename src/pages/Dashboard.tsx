import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO } from 'date-fns'
import { useTransactionStore } from '../store/useTransactionStore'
import { useAccountStore } from '../store/useAccountStore'
import { useBudgetStore } from '../store/useBudgetStore'
import Card from '../components/ui/Card'
import SpendingDonut from '../components/charts/SpendingDonut'
import DailyLine from '../components/charts/DailyLine'

const fmtCAD = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

export default function Dashboard() {
  const [date, setDate] = useState(new Date())
  const { transactions } = useTransactionStore()
  const { accounts } = useAccountStore()
  const { categories, budgets } = useBudgetStore()

  const monthStr   = format(date, 'yyyy-MM')
  const monthStart = format(startOfMonth(date), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(date), 'yyyy-MM-dd')
  const colorMap   = Object.fromEntries(categories.map(c => [c.name, c.color]))

  const monthTxns  = useMemo(() =>
    transactions.filter(t => !t.pending && t.date >= monthStart && t.date <= monthEnd),
    [transactions, monthStart, monthEnd]
  )
  const expenses   = useMemo(() => monthTxns.filter(t => t.amount > 0), [monthTxns])
  const income     = useMemo(() => monthTxns.filter(t => t.amount < 0), [monthTxns])

  const totalSpend = useMemo(() => expenses.reduce((s, t) => s + t.amount, 0), [expenses])
  const totalInc   = useMemo(() => income.reduce((s, t) => s + Math.abs(t.amount), 0), [income])
  const netWorth   = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts])

  const byCategory = useMemo<[string, number][]>(() => {
    const map: Record<string, number> = {}
    for (const t of expenses) map[t.category] = (map[t.category] ?? 0) + t.amount
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  const daily = useMemo<[string, number][]>(() => {
    const map: Record<string, number> = {}
    for (const t of expenses) map[t.date] = (map[t.date] ?? 0) + t.amount
    return Object.entries(map).sort()
  }, [expenses])

  const monthBudgets = budgets.filter(b => b.month === monthStr)

  const canGoNext = addMonths(date, 1) <= new Date()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
          <button onClick={() => setDate(d => subMonths(d, 1))}
            className="text-gray-400 hover:text-white transition-colors w-6">←</button>
          <span className="text-sm font-medium w-32 text-center">{format(date, 'MMMM yyyy')}</span>
          <button onClick={() => canGoNext && setDate(d => addMonths(d, 1))}
            className={`w-6 transition-colors ${canGoNext ? 'text-gray-400 hover:text-white' : 'text-gray-700 cursor-default'}`}>→</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Spent',        value: fmtCAD(totalSpend),           sub: `${expenses.length} transactions`,   color: 'text-red-400'     },
          { label: 'Income',       value: fmtCAD(totalInc),             sub: 'this month',                        color: 'text-emerald-400' },
          { label: 'Net Savings',  value: fmtCAD(totalInc - totalSpend),sub: totalInc >= totalSpend ? '↑ Positive' : '↓ Deficit', color: totalInc >= totalSpend ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Net Worth',    value: fmtCAD(netWorth),             sub: `${accounts.length} accounts`,       color: 'text-indigo-400'  },
        ].map(c => (
          <Card key={c.label}>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{c.label}</p>
            <p className={`text-2xl font-bold mb-1 ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-600">{c.sub}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Spending by Category">
          {byCategory.length ? (
            <SpendingDonut data={byCategory} total={totalSpend} />
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-600 text-sm">No data</div>
          )}
        </Card>
        <Card title="Daily Spending">
          {daily.length ? (
            <DailyLine data={daily} />
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-600 text-sm">No data</div>
          )}
        </Card>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <Card title="Category Breakdown">
          <div className="space-y-3">
            {byCategory.map(([cat, amount]) => {
              const budget = monthBudgets.find(b => b.category === cat)
              const pct = budget ? Math.min(amount / budget.limitAmount * 100, 100) : (amount / totalSpend * 100)
              const barColor = budget
                ? amount > budget.limitAmount ? '#ef4444' : amount > budget.limitAmount * 0.75 ? '#f59e0b' : '#22c55e'
                : (colorMap[cat] ?? '#6366f1')
              return (
                <div key={cat} className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colorMap[cat] ?? '#64748b' }} />
                  <span className="text-sm text-gray-300 w-36 truncate">{cat}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct.toFixed(1)}%`, background: barColor }} />
                  </div>
                  <span className="text-sm font-medium text-white w-24 text-right tabular-nums">{fmtCAD(amount)}</span>
                  {budget && (
                    <span className="text-xs text-gray-600 w-20 text-right">/ {fmtCAD(budget.limitAmount)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <Card title="Recent Transactions">
          <div className="space-y-1">
            {transactions.slice(0, 8).map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: colorMap[t.category] ?? '#64748b' }} />
                  <div>
                    <p className="text-sm text-gray-200">{t.merchantName || t.name}</p>
                    <p className="text-xs text-gray-600">{fmtDate(t.date)} · {t.category}</p>
                  </div>
                </div>
                <span className={`text-sm font-medium tabular-nums ${t.amount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {t.amount > 0 ? '-' : '+'}{fmtCAD(Math.abs(t.amount))}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

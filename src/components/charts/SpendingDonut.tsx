import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useBudgetStore } from '../../store/useBudgetStore'

interface Props {
  data: [string, number][]   // [category, amount]
  total: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

export default function SpendingDonut({ data, total }: Props) {
  const { categories } = useBudgetStore()
  const colorMap = Object.fromEntries(categories.map(c => [c.name, c.color]))

  const chartData = data.map(([name, value]) => ({ name, value }))

  return (
    <div className="relative h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={colorMap[entry.name] ?? `hsl(${(i * 47) % 360},65%,55%)`}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => [fmt(v), '']}
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
            labelStyle={{ color: '#e4e4e7' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Centre label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xl font-bold text-white">{fmt(total)}</span>
        <span className="text-xs text-gray-500">spent</span>
      </div>
    </div>
  )
}

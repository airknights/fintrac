import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useSpending } from "../hooks/api.js";
import { money, titleCase } from "../format.js";

const COLORS = ["#4f6df5", "#f59e4f", "#4fb0f5", "#9b59f5", "#f55f7d", "#4fd6a8", "#f5c14f", "#8a8f99"];

export function SpendingChart({ days = 30 }: { days?: number }) {
  const { data, isLoading } = useSpending(days);
  if (isLoading || !data) return <div className="card">Loading spending…</div>;
  if (data.byCategory.length === 0)
    return <div className="card muted">No spending in the last {days} days.</div>;

  const chartData = data.byCategory.map((c) => ({ name: titleCase(c.category), value: c.total }));

  return (
    <div className="card">
      <h3>Spending — last {days} days</h3>
      <div className="muted">Total {money(data.total)}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ width: 220, height: 220 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="legend">
          {chartData.map((c, i) => (
            <li key={c.name}>
              <span className="dot" style={{ background: COLORS[i % COLORS.length] }} />
              {c.name}
              <span className="right">{money(c.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

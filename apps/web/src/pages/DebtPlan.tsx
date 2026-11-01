import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDebtPlan, useDebts, useSetOverride } from "../hooks/api.js";
import { StrategyCard } from "../components/StrategyCard.js";
import { money } from "../format.js";

export function DebtPlan() {
  const { data: debtsData, isLoading } = useDebts();
  const plan = useDebtPlan();
  const override = useSetOverride();
  const [budget, setBudget] = useState(800);

  const debts = debtsData?.debts ?? [];
  const totalMinimums = useMemo(
    () => debts.reduce((s, d) => s + (d.minimumPayment ?? 0), 0),
    [debts],
  );

  const chartData = useMemo(() => {
    if (!plan.data || !plan.data.avalanche.feasible) return [];
    const a = plan.data.avalanche.schedule;
    const s = plan.data.snowball.schedule;
    const len = Math.max(a.length, s.length);
    const rows: Array<{ month: number; Avalanche?: number; Snowball?: number }> = [];
    for (let i = 0; i < len; i++) {
      rows.push({ month: i, Avalanche: a[i]?.totalBalance, Snowball: s[i]?.totalBalance });
    }
    return rows;
  }, [plan.data]);

  if (isLoading) return <div className="page">Loading debts…</div>;

  if (debts.length === 0) {
    return (
      <div className="page">
        <h2>Debt payoff plan</h2>
        <div className="card muted">No credit or loan accounts found. Add an account to get started.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Debt payoff plan</h2>
      <p className="muted">
        Total debt {money(debtsData?.totalDebt ?? 0)} · minimum payments {money(totalMinimums)}/mo
      </p>

      <div className="card">
        <h3>Your debts</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Debt</th>
              <th className="right">Balance</th>
              <th className="right">APR</th>
              <th className="right">Minimum</th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => (
              <tr key={d.accountId}>
                <td>{d.name}</td>
                <td className="right">{money(d.balance)}</td>
                <td className="right">
                  {d.apr != null ? (
                    `${d.apr.toFixed(2)}%`
                  ) : (
                    <OverrideInput
                      placeholder="APR %"
                      onSave={(v) => override.mutate({ accountId: d.accountId, apr: v, minimum: d.minimumPayment })}
                    />
                  )}
                </td>
                <td className="right">
                  {d.minimumPayment != null ? (
                    money(d.minimumPayment)
                  ) : (
                    <OverrideInput
                      placeholder="Min $"
                      onSave={(v) => override.mutate({ accountId: d.accountId, apr: d.apr, minimum: v })}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {debts.some((d) => d.needsInput) && (
          <p className="muted">
            Some debts are missing APR or minimum payment. Enter the values to include them in the plan.
          </p>
        )}
      </div>

      <div className="card">
        <label>
          Total monthly payment budget:{" "}
          <input
            type="number"
            value={budget}
            min={0}
            step={50}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
        </label>{" "}
        <button className="btn primary" onClick={() => plan.mutate(budget)} disabled={plan.isPending}>
          {plan.isPending ? "Calculating…" : "Build plan"}
        </button>
        {plan.error && <p className="error">{(plan.error as Error).message}</p>}
      </div>

      {plan.data && (
        <>
          {plan.data.needsInput.length > 0 && (
            <p className="muted">
              Excluded {plan.data.needsInput.length} debt(s) missing APR/minimum:{" "}
              {plan.data.needsInput.map((n) => n.name).join(", ")}
            </p>
          )}

          {plan.data.avalanche.feasible && (
            <div className="card highlight-banner">
              Avalanche saves <strong>{money(plan.data.interestSaved)}</strong> in interest
              {plan.data.monthsSaved !== 0 && <> and {Math.abs(plan.data.monthsSaved)} month(s)</>} vs. snowball.
            </div>
          )}

          <div className="grid">
            <StrategyCard
              title="Avalanche"
              subtitle="Highest APR first — least total interest"
              result={plan.data.avalanche}
              highlight
            />
            <StrategyCard
              title="Snowball"
              subtitle="Smallest balance first — fastest wins"
              result={plan.data.snowball}
            />
          </div>

          {chartData.length > 0 && (
            <div className="card">
              <h3>Balance over time</h3>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2e37" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} label={{ value: "month", position: "insideBottom", offset: -4 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="Avalanche" stroke="#4fd6a8" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="Snowball" stroke="#f59e4f" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OverrideInput({ placeholder, onSave }: { placeholder: string; onSave: (v: number) => void }) {
  const [v, setV] = useState("");
  return (
    <span className="override">
      <input
        type="number"
        placeholder={placeholder}
        value={v}
        style={{ width: 70 }}
        onChange={(e) => setV(e.target.value)}
      />
      <button className="btn small" disabled={v === ""} onClick={() => onSave(Number(v))}>
        Save
      </button>
    </span>
  );
}

import { useNetWorth } from "../hooks/api.js";
import { money } from "../format.js";

export function NetWorthCard() {
  const { data, isLoading } = useNetWorth();
  if (isLoading || !data) return <div className="card">Loading net worth…</div>;

  return (
    <div className="card stats">
      <div className="stat">
        <span className="label">Net worth</span>
        <span className={`value ${data.netWorth >= 0 ? "pos" : "neg"}`}>{money(data.netWorth)}</span>
      </div>
      <div className="stat">
        <span className="label">Assets</span>
        <span className="value pos">{money(data.assets)}</span>
      </div>
      <div className="stat">
        <span className="label">Total debt</span>
        <span className="value neg">{money(data.debts)}</span>
      </div>
    </div>
  );
}

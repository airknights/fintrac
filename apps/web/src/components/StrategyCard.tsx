import type { PayoffResult } from "../api/client.js";
import { money, months as fmtMonths } from "../format.js";

export function StrategyCard({
  title,
  subtitle,
  result,
  highlight,
}: {
  title: string;
  subtitle: string;
  result: PayoffResult;
  highlight?: boolean;
}) {
  if (!result.feasible) {
    return (
      <div className={`card strategy ${highlight ? "highlight" : ""}`}>
        <h3>{title}</h3>
        <p className="error">{result.reason}</p>
      </div>
    );
  }

  return (
    <div className={`card strategy ${highlight ? "highlight" : ""}`}>
      <h3>
        {title} {highlight && <span className="badge">recommended</span>}
      </h3>
      <p className="muted">{subtitle}</p>
      <div className="stats">
        <div className="stat">
          <span className="label">Debt-free in</span>
          <span className="value">{fmtMonths(result.months)}</span>
        </div>
        <div className="stat">
          <span className="label">Total interest</span>
          <span className="value neg">{money(result.totalInterest)}</span>
        </div>
      </div>
      <ol className="payoff-order">
        {result.payoffOrder.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <span className="muted">paid off month {p.payoffMonth}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

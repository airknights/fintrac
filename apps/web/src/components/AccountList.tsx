import { Fragment } from "react";
import { useAccounts } from "../hooks/api.js";
import { money, titleCase } from "../format.js";
import { DEBT_TYPES, groupByInstitution } from "../accounts.js";

export function AccountList() {
  const { data, isLoading } = useAccounts();
  if (isLoading || !data) return <div className="card">Loading accounts…</div>;
  if (data.accounts.length === 0) return <div className="card muted">No accounts yet.</div>;

  return (
    <div className="card">
      <h3>Accounts</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Type</th>
            <th className="right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {groupByInstitution(data.accounts).map((g) => (
            <Fragment key={g.institution}>
              <tr className="group-row">
                <td colSpan={2}>{g.institution}</td>
                <td className={`right ${g.net < 0 ? "neg" : ""}`}>{money(g.net)}</td>
              </tr>
              {g.accounts.map((a) => {
                const isDebt = DEBT_TYPES.has(a.type);
                return (
                  <tr key={a.account_id}>
                    <td>{a.name}</td>
                    <td>{titleCase(a.subtype ?? a.type)}</td>
                    <td className={`right ${isDebt ? "neg" : ""}`}>
                      {isDebt ? "−" : ""}
                      {money(a.current_balance)}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

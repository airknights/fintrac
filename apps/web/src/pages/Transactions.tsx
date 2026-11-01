import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccounts, useTransactions } from "../hooks/api.js";
import { money } from "../format.js";
import { DEBT_TYPES, groupByInstitution } from "../accounts.js";

export function Transactions() {
  // ?account=<id> so account rows can link straight to their transactions.
  const [params, setParams] = useSearchParams();
  const accountId = params.get("account") ?? "";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Search after typing pauses, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: accountsData } = useAccounts();
  const accounts = accountsData?.accounts ?? [];
  const account = accounts.find((a) => a.account_id === accountId);
  const tx = useTransactions({ accountId: accountId || undefined, search: search || undefined });
  const rows = tx.data?.pages.flatMap((p) => p.transactions) ?? [];
  const total = tx.data?.pages[0]?.total ?? 0;

  return (
    <div className="page">
      <h2>Transactions</h2>

      <div className="card" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Account{" "}
          <select
            value={accountId}
            onChange={(e) => setParams(e.target.value ? { account: e.target.value } : {}, { replace: true })}
          >
            <option value="">All accounts</option>
            {groupByInstitution(accounts).map((g) => (
              <optgroup key={g.institution} label={g.institution}>
                {g.accounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Search{" "}
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="e.g. Amazon"
          />
        </label>
      </div>

      {account && (
        <div className="card stats">
          <div className="stat">
            <span className="label">{DEBT_TYPES.has(account.type) ? "Balance owed" : "Current balance"}</span>
            <span className={`value ${DEBT_TYPES.has(account.type) ? "neg" : ""}`}>{money(account.current_balance)}</span>
            <span className="muted small-note">
              {account.balance_as_of
                ? `Bank balance as of ${account.balance_as_of}, plus later transactions`
                : "Sum of transactions — enter your bank's balance on the Accounts page"}
            </span>
          </div>
          {account.available_credit !== null && (
            <div className="stat">
              <span className="label">Available credit</span>
              <span className="value pos">{money(account.available_credit)}</span>
              <span className="muted small-note">of {money(account.credit_limit)} limit</span>
            </div>
          )}
        </div>
      )}

      <div className="card">
        {tx.isLoading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">{search ? "No transactions match your search." : "No transactions yet — import a CSV on the Accounts page."}</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Showing {rows.length} of {total}
              {account ? "" : " · pick an account to see its running balance"}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    {!account && <th>Account</th>}
                    <th>Description</th>
                    <th className="right">Amount</th>
                    {account && <th className="right">Balance</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.transaction_id}>
                      <td style={{ whiteSpace: "nowrap" }}>{t.date}</td>
                      {!account && <td>{t.account_name}</td>}
                      <td>{t.name ?? t.merchant_name ?? "—"}</td>
                      {/* amount is + for money out; show spending as − and money in as + */}
                      <td className={`right ${t.amount > 0 ? "neg" : "pos"}`} style={{ whiteSpace: "nowrap" }}>
                        {t.amount > 0 ? "−" : "+"}
                        {money(Math.abs(t.amount))}
                      </td>
                      {account && (
                        <td className="right" style={{ whiteSpace: "nowrap" }}>
                          {money(t.running_balance)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tx.hasNextPage && (
              <div style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => tx.fetchNextPage()} disabled={tx.isFetchingNextPage}>
                  {tx.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
        {tx.error && <p className="error">{(tx.error as Error).message}</p>}
      </div>
    </div>
  );
}

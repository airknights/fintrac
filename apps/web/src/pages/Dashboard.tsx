import { Link } from "react-router-dom";
import { NetWorthCard } from "../components/NetWorthCard.js";
import { AccountList } from "../components/AccountList.js";
import { SpendingChart } from "../components/SpendingChart.js";
import { useAccounts } from "../hooks/api.js";

export function Dashboard() {
  const { data, isLoading } = useAccounts();
  const empty = !isLoading && (data?.accounts.length ?? 0) === 0;

  if (empty) {
    return (
      <div className="page">
        <h2>Your financial picture</h2>
        <div className="card">
          <p>No accounts yet.</p>
          <Link className="btn primary" to="/accounts">
            Add an account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Your financial picture</h2>
      </div>
      <NetWorthCard />
      <div className="grid">
        <SpendingChart days={30} />
        <AccountList />
      </div>
    </div>
  );
}

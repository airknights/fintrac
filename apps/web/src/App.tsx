import { NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.js";
import { DebtPlan } from "./pages/DebtPlan.js";
import { Accounts } from "./pages/Accounts.js";
import { Transactions } from "./pages/Transactions.js";

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Fintrac</span>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/debt-plan">Debt Plan</NavLink>
          <NavLink to="/accounts">Accounts</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/debt-plan" element={<DebtPlan />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/transactions" element={<Transactions />} />
        </Routes>
      </main>
    </div>
  );
}

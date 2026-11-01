// Pure debt-payoff computation. No I/O.
//
// Given a set of debts (balance, APR, minimum payment) and a total monthly
// budget shared across all of them, simulate month-by-month payoff under two
// strategies and report the timeline, total interest, and payoff order.

export interface Debt {
  id: string;
  name: string;
  balance: number;
  aprPercentage: number; // annual %, e.g. 19.99
  minimumPayment: number;
}

export type Strategy = "avalanche" | "snowball";

export interface PayoffResult {
  strategy: Strategy;
  feasible: boolean;
  reason?: string;
  months: number;
  totalInterest: number;
  totalPaid: number;
  payoffOrder: Array<{ id: string; name: string; payoffMonth: number }>;
  // Per-month total remaining balance across all debts (for charting).
  schedule: Array<{ month: number; totalBalance: number }>;
}

const MAX_MONTHS = 600; // 50-year guard

function orderFor(strategy: Strategy, debts: Debt[]): Debt[] {
  const copy = [...debts];
  if (strategy === "avalanche") {
    copy.sort((a, b) => b.aprPercentage - a.aprPercentage || a.balance - b.balance);
  } else {
    copy.sort((a, b) => a.balance - b.balance || b.aprPercentage - a.aprPercentage);
  }
  return copy;
}

export function simulate(debtsInput: Debt[], monthlyBudget: number, strategy: Strategy): PayoffResult {
  const debts = debtsInput
    .filter((d) => d.balance > 0)
    .map((d) => ({ ...d, balance: d.balance }));

  const base: PayoffResult = {
    strategy,
    feasible: true,
    months: 0,
    totalInterest: 0,
    totalPaid: 0,
    payoffOrder: [],
    schedule: [{ month: 0, totalBalance: debts.reduce((s, d) => s + d.balance, 0) }],
  };

  if (debts.length === 0) return base;

  const sumMinimums = debts.reduce((s, d) => s + d.minimumPayment, 0);
  if (monthlyBudget < sumMinimums) {
    return {
      ...base,
      feasible: false,
      reason: `Monthly budget ($${monthlyBudget.toFixed(2)}) is less than the sum of minimum payments ($${sumMinimums.toFixed(2)}).`,
    };
  }

  const order = orderFor(strategy, debts);
  const balances = new Map(debts.map((d) => [d.id, d.balance]));
  const payoffOrder: PayoffResult["payoffOrder"] = [];
  const schedule = [...base.schedule];
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;

  const remaining = () => order.filter((d) => (balances.get(d.id) ?? 0) > 0.005);

  while (remaining().length > 0) {
    month++;
    if (month > MAX_MONTHS) {
      return {
        ...base,
        feasible: false,
        reason: "A debt never amortizes — a minimum payment is below the monthly interest. Increase the budget or check the APR.",
      };
    }

    // 1. Accrue interest on every outstanding debt.
    for (const d of debts) {
      const bal = balances.get(d.id) ?? 0;
      if (bal <= 0) continue;
      const interest = bal * (d.aprPercentage / 100 / 12);
      balances.set(d.id, bal + interest);
      totalInterest += interest;
    }

    // 2. Pay minimums on every outstanding debt.
    let budget = monthlyBudget;
    for (const d of debts) {
      const bal = balances.get(d.id) ?? 0;
      if (bal <= 0) continue;
      const pay = Math.min(d.minimumPayment, bal, budget);
      balances.set(d.id, bal - pay);
      budget -= pay;
      totalPaid += pay;
    }

    // 3. Throw the rest at debts in strategy order.
    for (const d of order) {
      if (budget <= 0.005) break;
      const bal = balances.get(d.id) ?? 0;
      if (bal <= 0) continue;
      const pay = Math.min(bal, budget);
      balances.set(d.id, bal - pay);
      budget -= pay;
      totalPaid += pay;
    }

    // 4. Detect non-amortizing case early (total balance not shrinking).
    const totalBalance = debts.reduce((s, d) => s + Math.max(0, balances.get(d.id) ?? 0), 0);
    const prev = schedule[schedule.length - 1]!.totalBalance;
    if (month > 1 && totalBalance >= prev - 0.005) {
      return {
        ...base,
        feasible: false,
        reason: "Balances aren't decreasing — minimum payments are below accruing interest. Increase the monthly budget.",
      };
    }

    // 5. Record payoffs this month.
    for (const d of order) {
      const bal = balances.get(d.id) ?? 0;
      if (bal <= 0.005 && !payoffOrder.find((p) => p.id === d.id)) {
        payoffOrder.push({ id: d.id, name: d.name, payoffMonth: month });
      }
    }

    schedule.push({ month, totalBalance: Math.max(0, totalBalance) });
  }

  return {
    strategy,
    feasible: true,
    months: month,
    totalInterest: round2(totalInterest),
    totalPaid: round2(totalPaid),
    payoffOrder,
    schedule: schedule.map((s) => ({ month: s.month, totalBalance: round2(s.totalBalance) })),
  };
}

export interface DebtPlan {
  avalanche: PayoffResult;
  snowball: PayoffResult;
  interestSaved: number; // snowball.totalInterest - avalanche.totalInterest
  monthsSaved: number;
}

export function buildDebtPlan(debts: Debt[], monthlyBudget: number): DebtPlan {
  const avalanche = simulate(debts, monthlyBudget, "avalanche");
  const snowball = simulate(debts, monthlyBudget, "snowball");
  const interestSaved =
    avalanche.feasible && snowball.feasible ? round2(snowball.totalInterest - avalanche.totalInterest) : 0;
  const monthsSaved =
    avalanche.feasible && snowball.feasible ? snowball.months - avalanche.months : 0;
  return { avalanche, snowball, interestSaved, monthsSaved };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

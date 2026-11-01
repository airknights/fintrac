import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { setDebtOverride } from "../db/queries.js";
import { buildDebtPlan, type Debt } from "../services/debtPlanner.js";

export const debtRoutes = new Hono();

interface DebtRow {
  account_id: string;
  name: string;
  balance: number;
  apr: number | null;
  minimum: number | null;
}

// All credit/loan accounts, with APR + minimum from manual overrides.
// Balance is the amount owed (positive).
function loadDebtRows(): DebtRow[] {
  return db
    .prepare(
      `SELECT a.account_id,
              COALESCE(a.name, 'Account') AS name,
              COALESCE(a.current_balance, 0) AS balance,
              o.apr_percentage AS apr,
              o.minimum_payment AS minimum
       FROM accounts a
       LEFT JOIN debt_overrides o ON o.account_id = a.account_id
       WHERE a.type IN ('credit','loan')
       ORDER BY balance DESC`,
    )
    .all() as unknown as DebtRow[];
}

debtRoutes.get("/debts", (c) => {
  const rows = loadDebtRows();
  const debts = rows.map((r) => ({
    accountId: r.account_id,
    name: r.name,
    balance: round2(r.balance),
    apr: r.apr,
    minimumPayment: r.minimum,
    needsInput: r.apr == null || r.minimum == null,
  }));
  const totalDebt = round2(debts.reduce((s, d) => s + d.balance, 0));
  return c.json({ debts, totalDebt });
});

// Manually set APR / minimum payment for a debt account.
const overrideSchema = z.object({
  apr: z.number().min(0).max(100).nullable().optional(),
  minimum: z.number().min(0).nullable().optional(),
});

debtRoutes.post("/debts/:accountId/override", async (c) => {
  const accountId = c.req.param("accountId");
  const parsed = overrideSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  setDebtOverride(accountId, parsed.data.apr ?? null, parsed.data.minimum ?? null);
  return c.json({ ok: true });
});

// Build avalanche + snowball plans for a given monthly budget.
const planSchema = z.object({ monthlyBudget: z.number().positive() });

debtRoutes.post("/debt-plan", async (c) => {
  const parsed = planSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "monthlyBudget (positive number) is required" }, 400);
  }

  const rows = loadDebtRows().filter((r) => r.balance > 0);
  const usable: Debt[] = [];
  const needsInput: Array<{ accountId: string; name: string; balance: number }> = [];

  for (const r of rows) {
    if (r.apr == null || r.minimum == null) {
      needsInput.push({ accountId: r.account_id, name: r.name, balance: round2(r.balance) });
      continue;
    }
    usable.push({
      id: r.account_id,
      name: r.name,
      balance: r.balance,
      aprPercentage: r.apr,
      minimumPayment: r.minimum,
    });
  }

  const plan = buildDebtPlan(usable, parsed.data.monthlyBudget);
  return c.json({ ...plan, debtsUsed: usable.length, needsInput });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

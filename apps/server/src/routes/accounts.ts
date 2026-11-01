import { Hono } from "hono";
import { z } from "zod";
import { createAccount, deleteAccount, getAccounts, updateAccountBalance } from "../db/queries.js";

export const accountRoutes = new Hono();

const ASSET_TYPES = new Set(["depository", "investment", "brokerage", "other"]);
const DEBT_TYPES = new Set(["credit", "loan"]);

accountRoutes.get("/accounts", async (c) => {
  return c.json({ accounts: await getAccounts() });
});

const createSchema = z.object({
  name: z.string().min(1),
  institutionName: z.string().min(1).nullable().optional(),
  type: z.enum(["depository", "credit", "loan", "investment", "other"]),
  subtype: z.string().min(1).nullable().optional(),
  isoCurrency: z.string().min(1).optional(),
  openingBalance: z.number().optional(),
});

accountRoutes.post("/accounts", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const accountId = await createAccount(parsed.data);
  return c.json({ accountId });
});

const balanceSchema = z.object({ balance: z.number() });

accountRoutes.patch("/accounts/:id/balance", async (c) => {
  const parsed = balanceSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await updateAccountBalance(c.req.param("id"), parsed.data.balance);
  return c.json({ ok: true });
});

accountRoutes.delete("/accounts/:id", async (c) => {
  await deleteAccount(c.req.param("id"));
  return c.json({ ok: true });
});

// Net worth = assets - debts. Credit/loan balances are positive amounts owed.
accountRoutes.get("/net-worth", async (c) => {
  const accounts = await getAccounts();
  let assets = 0;
  let debts = 0;
  for (const a of accounts) {
    const bal = (a.current_balance as number) ?? 0;
    if (DEBT_TYPES.has(a.type)) debts += bal;
    else if (ASSET_TYPES.has(a.type)) assets += bal;
  }
  return c.json({
    assets: round2(assets),
    debts: round2(debts),
    netWorth: round2(assets - debts),
    accountCount: accounts.length,
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

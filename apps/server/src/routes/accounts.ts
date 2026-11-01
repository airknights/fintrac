import { Hono } from "hono";
import { z } from "zod";
import {
  createAccount,
  deleteAccount,
  getAccounts,
  updateAccountBalance,
  updateAccountDetails,
} from "../db/queries.js";

export const accountRoutes = new Hono();

const ASSET_TYPES = new Set(["depository", "investment", "brokerage", "other"]);
const DEBT_TYPES = new Set(["credit", "loan"]);

accountRoutes.get("/accounts", async (c) => {
  return c.json({ accounts: await getAccounts() });
});

const accountType = z.enum(["depository", "credit", "loan", "investment", "other"]);

const createSchema = z.object({
  name: z.string().min(1),
  institutionName: z.string().min(1).nullable().optional(),
  type: accountType,
  subtype: z.string().min(1).nullable().optional(),
  isoCurrency: z.string().min(1).optional(),
  openingBalance: z.number().optional(),
  availableCredit: z.number().nullable().optional(),
});

accountRoutes.post("/accounts", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const accountId = await createAccount(parsed.data);
  return c.json({ accountId });
});

// Either or both, as the bank shows them today.
const balanceSchema = z
  .object({ balance: z.number().optional(), availableCredit: z.number().nullable().optional() })
  .refine((b) => b.balance !== undefined || b.availableCredit !== undefined, "balance or availableCredit required");

accountRoutes.patch("/accounts/:id/balance", async (c) => {
  const parsed = balanceSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const found = await updateAccountBalance(c.req.param("id"), parsed.data);
  if (!found) return c.json({ error: "Account not found" }, 404);
  return c.json({ ok: true });
});

// Edit bank / type / subtype; any subset. Blank bank or subtype clears it.
const updateSchema = z.object({
  institutionName: z.string().trim().nullable().optional(),
  type: accountType.optional(),
  subtype: z.string().trim().nullable().optional(),
});

accountRoutes.patch("/accounts/:id", async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { institutionName, type, subtype } = parsed.data;
  const found = await updateAccountDetails(c.req.param("id"), {
    institutionName: institutionName === undefined ? undefined : institutionName || null,
    type,
    subtype: subtype === undefined ? undefined : subtype || null,
  });
  if (!found) return c.json({ error: "Account not found" }, 404);
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

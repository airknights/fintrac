import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { initDb } from "./db/index.js";
import { accountRoutes } from "./routes/accounts.js";
import { transactionRoutes } from "./routes/transactions.js";
import { debtRoutes } from "./routes/debts.js";
import { importRoutes } from "./routes/imports.js";

const app = new Hono();

// Vite dev proxy makes calls same-origin; CORS is a belt-and-suspenders for
// any direct localhost:5173 -> :8787 requests.
app.use("/api/*", cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));

app.get("/api/health", (c) => c.json({ ok: true }));

const api = new Hono();
api.route("/", accountRoutes);
api.route("/", transactionRoutes);
api.route("/", debtRoutes);
api.route("/", importRoutes);
app.route("/api", api);

app.onError((err, c) => {
  console.error("[server error]", err);
  return c.json({ error: err.message ?? "Internal error" }, 500);
});

await initDb(); // connect + apply pending migrations before accepting requests

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`[fintrac] server on http://localhost:${info.port}`);
});

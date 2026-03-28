# Cloudflare Worker Setup — Step-by-Step

This worker is the only server-side code in Fintrac. It is ~40 lines,
proxies requests to the Plaid API, and never stores any of your data.
Financial transaction data flows directly: Browser → Plaid → Browser.

---

## What you need

- A free Cloudflare account → https://dash.cloudflare.com/sign-up
- A free Plaid developer account → https://dashboard.plaid.com/signup

---

## Step 1 — Get your Plaid API keys

1. Sign in to https://dashboard.plaid.com
2. Go to **Team Settings → Keys**
3. Note down:
   - `client_id`  (same for all environments)
   - `Sandbox secret`  (use this while testing — free, uses fake bank data)
   - `Development secret`  (use this to test with real Canadian banks — free, up to 100 Items)
4. In the Sandbox, use these test credentials when prompted by Plaid Link:
   - **Username:** `user_good`
   - **Password:** `pass_good`

---

## Step 2 — Deploy the Worker

### Option A — Cloudflare Dashboard (no CLI needed)

1. Go to https://dash.cloudflare.com → **Workers & Pages → Create**
2. Click **Create Worker**
3. Name it `fintrac-plaid`
4. Click **Edit code** → paste the entire contents of `worker.js` → **Deploy**

### Option B — Wrangler CLI

```bash
npm install -g wrangler
wrangler login
wrangler deploy worker.js --name fintrac-plaid --compatibility-date 2024-01-01
```

---

## Step 3 — Set environment secrets

In the Cloudflare Dashboard → your Worker → **Settings → Variables → Add variable**:

| Variable name    | Value                              | Encrypt? |
|------------------|------------------------------------|----------|
| `PLAID_CLIENT_ID`| Your Plaid client_id               | Yes      |
| `PLAID_SECRET`   | Your sandbox or development secret | Yes      |
| `PLAID_ENV`      | `sandbox` or `development`         | No       |
| `ALLOWED_ORIGIN` | `http://localhost:5173` (dev) or your production URL | No |

> ✅ Mark `PLAID_CLIENT_ID` and `PLAID_SECRET` as **Encrypted** — Cloudflare will never show them again after saving.

Click **Save and deploy**.

---

## Step 4 — Add the Worker URL to your app

Your worker URL looks like:
```
https://fintrac-plaid.YOUR-SUBDOMAIN.workers.dev
```

Find it under **Workers & Pages → fintrac-plaid → Triggers**.

Add it to your `.env` file:

```env
VITE_CF_WORKER_URL=https://fintrac-plaid.your-subdomain.workers.dev
```

Then restart the dev server:
```bash
npm run dev
```

---

## Step 5 — Test it

1. Go to the **Accounts** page in Fintrac
2. Click **Connect Bank**
3. Search for any bank (in Sandbox, all banks work)
4. Use credentials `user_good` / `pass_good`
5. Your accounts and transactions will appear automatically

---

## Going to Production (real Canadian banks)

1. In your Plaid dashboard → **Team Settings → Keys** → copy your **Production secret**
2. Update the `PLAID_SECRET` and `PLAID_ENV=production` variables in Cloudflare
3. Request Production access from Plaid (required — takes 1–2 business days)
4. Update `ALLOWED_ORIGIN` to your production domain

---

## Security notes

- `PLAID_SECRET` is stored as an **encrypted secret** in Cloudflare — not in your code
- The worker only allows 6 specific Plaid endpoints (hardcoded allowlist)
- Transaction data never touches the worker — only token strings do
- Set `ALLOWED_ORIGIN` to your specific domain in production (not `*`)

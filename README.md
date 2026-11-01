# Fintrac

A **local-first** personal financial tracker. You add your bank, card, and
loan accounts by hand and import transaction history from CSV files
downloaded from your bank's website. It shows your total financial picture
(net worth, balances, spending), and builds a plan to get out of debt
(avalanche vs. snowball).

Everything runs on your own machine: a tiny localhost backend stores data in
a local SQLite file. Nothing is sent to any server — there's no external
service involved at all.

## Architecture

```
apps/web      React + Vite frontend (port 5173)
apps/server   Hono backend on localhost (port 8787) — SQLite DB at
              apps/server/data/fintrac.db
```

The Vite dev server proxies `/api` → `:8787`, so the browser sees one origin.

## Setup

1. Install dependencies (from repo root):

   ```sh
   npm install
   ```

2. (Optional) create `apps/server/.env` from `apps/server/.env.example` if
   you want to change the port (defaults to 8787).

3. Start both apps:

   ```sh
   npm run dev
   ```

4. Open <http://localhost:5173> → **Accounts** → add an account, then
   **Import CSV** to load transaction history from a file exported from your
   bank's website.

## Importing transactions

Bank CSV exports vary in shape — some have a single signed `Amount` column,
others split `Debit`/`Credit` into separate columns, and date formats differ.
The import flow previews the file's columns and lets you map which column is
which (date, description, amount or debit/credit) before importing. Importing
the same file twice is safe — matching transactions are updated in place
rather than duplicated.

## Notes

- The SQLite DB and all `.env` files are gitignored — never commit financial
  data.
- Account balances are entered/updated by hand on the Accounts page.
- Debt APR and minimum payments are entered manually on the Debt Plan page.

# Fintrac

A **local-first** personal financial tracker. You add your bank, card, and
loan accounts by hand and import transaction history from CSV files
downloaded from your bank's website. It shows your total financial picture
(net worth, balances, spending), and builds a plan to get out of debt
(avalanche vs. snowball).

Everything runs on your own machine: a tiny localhost backend stores data in
a Postgres database running in a local Docker container. Nothing is sent to
any server — there's no external service involved at all.

## Architecture

```
apps/web      React + Vite frontend (port 5173)
apps/server   Hono backend on localhost (port 8787)
postgres      Docker container (docker-compose.yml), 127.0.0.1:5433,
              data in the `fintrac-pgdata` Docker volume
```

The Vite dev server proxies `/api` → `:8787`, so the browser sees one origin.

## Setup

Requires Node 22+ and Docker Desktop.

1. Install dependencies (from repo root):

   ```sh
   npm install
   ```

2. (Optional) create `apps/server/.env` from `apps/server/.env.example` if
   you want to change the port (defaults to 8787) or `DATABASE_URL`.

3. Start everything (`dev` starts the Postgres container first):

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
which (date, description, and either one amount column or separate "money
in" / "money out" columns) before importing. Importing
the same file twice is safe — matching transactions are updated in place
rather than duplicated.

- **No header row?** Some banks (e.g. TD) export without one — untick
  "First row is column headers" and columns show as Column 1, 2, …
- **Several files at once:** pick multiple CSVs in the file picker (e.g. a
  year exported month by month). They're imported in one transaction.
- **Balance from the file:** map the optional Balance column and the
  account's balance is set from the newest row. Debt balances are stored as a
  positive amount owed regardless of the bank's sign.
- **Saved mapping:** each account remembers its last column mapping, so the
  next import is pick files → Import.

## Database

The schema is defined by numbered SQL migrations in
`apps/server/src/db/migrations/` (`0001_initial.sql`, `0002_…`, …). Pending
migrations are applied automatically when the server starts, each in its own
transaction, and recorded in the `schema_migrations` table.

To change the schema:

1. `npm run db:migrate -- new add_notes_to_accounts` — creates the next
   numbered file.
2. Write the SQL in it (e.g. `ALTER TABLE accounts ADD COLUMN notes TEXT;`).
3. Restart the server, or run `npm run db:migrate`.

Never edit a migration that has already been applied — the server refuses to
start if one changes. Add a new migration instead.

| Command | What it does |
| --- | --- |
| `npm run db:up` | Start the Postgres container |
| `npm run db:down` | Stop it (data is kept in the volume) |
| `npm run db:psql` | Open a `psql` shell in the database |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:migrate -- status` | List applied / pending migrations |
| `npm run db:migrate -- new <name>` | Create a new migration file |
| `docker compose down -v` | Stop **and delete all data** |
| `npm run db:import-sqlite --workspace apps/server` | Copy data from the old SQLite file into Postgres |

## Notes

- All `.env` files are gitignored, and data lives only in the local Docker
  volume — never commit financial data.
- Account balances are entered/updated by hand on the Accounts page.
- Debt APR and minimum payments are entered manually on the Debt Plan page.

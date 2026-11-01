import pg from "pg";
import { config } from "../config.js";
import { migrate } from "./migrate.js";

// Storage is intentionally isolated behind this module. Postgres runs in
// Docker (see docker-compose.yml at the repo root).

// Return NUMERIC / BIGINT (e.g. COUNT) as JS numbers and DATE as a plain
// YYYY-MM-DD string, so API responses keep the same shape as before.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export function query<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<T[]> {
  return pool.query<T>(text, params).then((r) => r.rows);
}

// Runs fn inside a single transaction on one pooled connection.
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Apply pending migrations on boot.
export async function initDb(): Promise<void> {
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    console.error(
      `\n[fintrac] Could not connect to Postgres at ${redact(config.DATABASE_URL)}.\n` +
        `Is the container running? Start it with: npm run db:up\n`,
    );
    throw err;
  }
  await migrate(pool);
}

function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@");
}

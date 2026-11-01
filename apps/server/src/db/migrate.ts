import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type pg from "pg";

// Forward-only SQL migrations. Files in ./migrations named NNNN_description.sql
// are applied in order, each in its own transaction, and recorded in
// schema_migrations. Never edit a migration once it has been applied — add a
// new one instead (a checksum check enforces this).

const __dirname = dirname(fileURLToPath(import.meta.url));
export const migrationsDir = resolve(__dirname, "migrations");

const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
// Arbitrary constant: serializes concurrent runners (e.g. two servers booting).
const LOCK_ID = 727_001;

interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export function loadMigrations(): Migration[] {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const migrations = files.map((name) => {
    const m = name.match(FILE_PATTERN);
    if (!m) throw new Error(`Bad migration filename "${name}" — expected NNNN_description.sql`);
    const sql = readFileSync(resolve(migrationsDir, name), "utf8");
    return { version: Number(m[1]), name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  });
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migration numbering gap or duplicate at "${m.name}" (expected ${i + 1})`);
  });
  return migrations;
}

export async function migrate(pool: pg.Pool): Promise<void> {
  const migrations = loadMigrations();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query<{ version: number; name: string; checksum: string }>(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
    );
    const applied = new Map(rows.map((r) => [r.version, r]));

    for (const r of rows) {
      const m = migrations[r.version - 1];
      if (!m) throw new Error(`Database has migration ${r.name} but the file is missing`);
      if (m.checksum !== r.checksum) {
        throw new Error(`Migration ${m.name} was edited after it was applied. Revert it and add a new migration instead.`);
      }
    }

    for (const m of migrations) {
      if (applied.has(m.version)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
          m.version,
          m.name,
          m.checksum,
        ]);
        await client.query("COMMIT");
        console.log(`[migrate] applied ${m.name}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}

// Migration commands:
//   npm run db:migrate                     apply pending migrations
//   npm run db:migrate -- status           list applied / pending
//   npm run db:migrate -- new add_notes    create the next NNNN_add_notes.sql
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initDb, pool, query } from "./index.js";
import { loadMigrations, migrationsDir } from "./migrate.js";

const [command = "up", arg] = process.argv.slice(2);

if (command === "new") {
  const slug = (arg ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!slug) {
    console.error("Usage: npm run db:migrate -- new <description>");
    process.exit(1);
  }
  const version = String(loadMigrations().length + 1).padStart(4, "0");
  const file = resolve(migrationsDir, `${version}_${slug}.sql`);
  writeFileSync(file, `-- ${slug.replace(/_/g, " ")}\n\n`);
  console.log(`Created ${file}`);
} else if (command === "status") {
  // Read-only: don't apply anything, and cope with a DB that has never been migrated.
  const [{ exists }] = await query<{ exists: boolean }>(
    "SELECT to_regclass('schema_migrations') IS NOT NULL AS exists",
  ) as [{ exists: boolean }];
  const rows = exists
    ? await query<{ version: number; applied_at: Date }>("SELECT version, applied_at FROM schema_migrations")
    : [];
  const applied = new Map(rows.map((r) => [r.version, r.applied_at]));
  for (const m of loadMigrations()) {
    const at = applied.get(m.version);
    console.log(`${at ? "applied" : "pending"}  ${m.name}${at ? `  (${at.toISOString()})` : ""}`);
  }
  await pool.end();
} else if (command === "up") {
  await initDb();
  console.log("[migrate] up to date");
  await pool.end();
} else {
  console.error(`Unknown command "${command}". Use: up | status | new <description>`);
  process.exit(1);
}

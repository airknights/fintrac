import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { dataDir, dbPath } from "../config.js";

// Storage is intentionally isolated behind this module. We use Node's
// built-in node:sqlite (synchronous, zero native build). Swapping to
// better-sqlite3 / @libsql/client later only touches this file.

const __dirname = dirname(fileURLToPath(import.meta.url));

mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);

// Apply schema (idempotent) on boot.
const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf8");
db.exec(schema);

export type Row = Record<string, unknown>;

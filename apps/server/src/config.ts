import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, "..");

// Load apps/server/.env (falls back to repo-root .env if present).
dotenv.config({ path: resolve(serverRoot, ".env") });
const rootEnv = resolve(serverRoot, "..", "..", ".env");
if (existsSync(rootEnv)) dotenv.config({ path: rootEnv });

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`\n[fintrac] Invalid backend configuration.\n${issues}\n`);
  process.exit(1);
}

export const config = parsed.data;
export const dataDir = resolve(serverRoot, "data");
export const dbPath = resolve(dataDir, "fintrac.db");

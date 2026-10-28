/**
 * Container entrypoint: apply pending Prisma migrations, then start the
 * standalone Next.js server.
 *
 * Migrations are executed directly with better-sqlite3 (which the standalone
 * bundle already contains) instead of `prisma migrate deploy`, because the
 * standalone output ships no Prisma CLI and the runtime image has no npm/npx.
 * The _prisma_migrations bookkeeping matches Prisma's own format (sha256 of
 * migration.sql, one row per applied migration), so a later `prisma migrate`
 * run sees these as applied.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const APP_DIR = process.cwd();
const DATA_DIR = process.env.DB_PATH || "/data";
const DB_FILE = path.join(DATA_DIR, "dev.db");
const MIGRATIONS_DIR = path.join(APP_DIR, "prisma", "migrations");

function migrate() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_FILE);
  try {
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
    `);

    const names = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    let applied = 0;
    for (const name of names) {
      const sqlFile = path.join(MIGRATIONS_DIR, name, "migration.sql");
      if (!fs.existsSync(sqlFile)) continue;
      const seen = db
        .prepare("SELECT 1 FROM _prisma_migrations WHERE migration_name = ?")
        .get(name);
      if (seen) continue;

      const sql = fs.readFileSync(sqlFile, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      db.exec("BEGIN");
      try {
        db.exec(sql);
        db.prepare(
          `INSERT INTO _prisma_migrations
             (id, checksum, migration_name, finished_at, applied_steps_count)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)`
        ).run(crypto.randomUUID(), checksum, name);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw new Error(`migration ${name} failed: ${error.message}`);
      }
      applied += 1;
      console.log(`[migrate] applied ${name}`);
    }
    console.log(`[migrate] database ready at ${DB_FILE} (${applied} applied)`);
  } finally {
    db.close();
  }
}

migrate();

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

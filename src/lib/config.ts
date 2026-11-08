/**
 * Centralised configuration for environment variables.
 *
 * New code should read config values from here instead of scattering
 * `process.env.XXX` across modules. Existing modules are migrated
 * incrementally — this file does NOT replace all env access yet.
 *
 * Design: §4.8 — config and logger centralisation.
 */

import { readPositiveIntEnv } from "@/lib/llm/env";

export const config = {
  jwt: {
    /** JWT signing secret. Required for auth to function. */
    secret: process.env.JWT_SECRET ?? "",
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? "7d",
  },
  python: {
    path: process.env.PYTHON_PATH ?? "python",
    threadLimit: readPositiveIntEnv("PYTHON_THREAD_LIMIT", 4),
    priority: process.env.PYTHON_PRIORITY ?? "below_normal",
  },
  upload: {
    maxSize: readPositiveIntEnv("MAX_UPLOAD_SIZE", 104_857_600),
    converterTimeoutMs: readPositiveIntEnv("CONVERTER_TIMEOUT_MS", 300_000),
  },
  db: {
    /** Explicit DB path override. Falls back to data dir resolution. */
    path: process.env.DB_PATH ?? "",
    /** Postgres URL (takes precedence over SQLite when set). */
    url: process.env.DATABASE_URL ?? "",
    /** AES-256 encryption key for DB credential storage. Required for PG. */
    encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  },
} as const;

/**
 * Validate that required environment variables are set.
 * Returns an array of error messages (empty = all good).
 */
export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.jwt.secret) {
    errors.push("JWT_SECRET is required");
  }
  if (!config.db.encryptionKey) {
    errors.push("ENCRYPTION_KEY is required for database credential encryption");
  }
  return errors;
}

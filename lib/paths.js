import path from "node:path";

/**
 * Where runtime data (database, uploads, dev secret) lives.
 * Normally ./data. On Vercel the project folder is read-only and only /tmp is
 * writable, so data goes there; note that /tmp is wiped whenever Vercel starts
 * a new instance, so use DATABASE_FILE / STORAGE_DIR on a persistent disk (or a
 * host with one) for real use. See README, "Deploy to production".
 */
export const DATA_DIR = process.env.DATA_DIR ?? (process.env.VERCEL ? "/tmp/adc-data" : path.join(/* turbopackIgnore: true */ process.cwd(), "data"));

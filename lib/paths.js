import path from "node:path";

/**
 * Where local runtime files live: uploads, the development database
 * (data/pglite) and the development secret. Normally ./data. On Vercel the
 * project folder is read-only and only /tmp is writable, so files go there;
 * /tmp is wiped whenever Vercel starts a new instance, which is why the
 * production database is Postgres, not a file (see README, Database).
 */
export const DATA_DIR = process.env.DATA_DIR ?? (process.env.VERCEL ? "/tmp/adc-data" : path.join(/* turbopackIgnore: true */ process.cwd(), "data"));

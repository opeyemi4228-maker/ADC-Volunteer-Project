import { one } from './db.js';
import { blind } from './crypto.js';

/** Database-backed fixed-window limiter; works across Vercel instances. */
export async function takeRateLimit(bucket, identity, limit, seconds) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const key = `${blind(`${bucket}:${identity}`)}:${window}`;
  const expires = new Date((window + 1) * seconds * 1000).toISOString();
  const row = await one(`INSERT INTO rate_limits (key, hits, expires_at) VALUES (:key, 1, :expires)
    ON CONFLICT (key) DO UPDATE SET hits = rate_limits.hits + 1
    WHERE rate_limits.hits < :limit RETURNING hits`, { key, expires, limit });
  return Boolean(row);
}

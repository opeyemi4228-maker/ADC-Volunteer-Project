import { run } from './db.js';
import { validKey } from './objects.js';

/** Queue deletion durably; the maintenance job retries object-store outages. */
export async function queueObjectDeletion(key) {
  validKey(key);
  await run('INSERT INTO storage_deletions (storage_key) VALUES (:key) ON CONFLICT (storage_key) DO NOTHING', { key });
}

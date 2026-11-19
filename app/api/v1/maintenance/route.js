import { timingSafeEqual } from 'node:crypto';
import { all, one, run, tx } from '@/lib/db';
import { deleteObject } from '@/lib/objects';
import { discardUploadParts } from '@/lib/storage';

export const maxDuration = 300;
export async function GET(request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
  const supplied = request.headers.get('authorization') ?? '';
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) return new Response('Unauthorized', { status: 401 });
  await run('DELETE FROM rate_limits WHERE expires_at < now()');
  await run('DELETE FROM sessions WHERE expires_at < now()');
  await run("DELETE FROM otp_codes WHERE expires_at < now() - interval '1 day'");
  await run("DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'");
  const stale = await all("SELECT id FROM uploads WHERE done = 0 AND created_at < now() - interval '7 days' ORDER BY created_at LIMIT 25");
  let removed = 0;
  for (const item of stale) {
    await tx(async () => {
      const upload = await one("SELECT * FROM uploads WHERE id = :id AND done = 0 FOR UPDATE", { id: item.id });
      if (!upload) return;
      await discardUploadParts(upload);
      await run('DELETE FROM uploads WHERE id = :id', { id: item.id });
      removed += 1;
    });
  }
  const queued = await all('SELECT storage_key FROM storage_deletions ORDER BY attempts, created_at LIMIT 100');
  let deleted = 0, failed = 0;
  for (const item of queued) {
    try {
      await deleteObject(item.storage_key);
      await run('DELETE FROM storage_deletions WHERE storage_key = :key', { key: item.storage_key });
      deleted += 1;
    } catch {
      await run('UPDATE storage_deletions SET attempts = attempts + 1 WHERE storage_key = :key', { key: item.storage_key });
      failed += 1;
    }
  }
  return Response.json({ ok: failed === 0, abandonedUploadsRemoved: removed, objectsDeleted: deleted, objectsPendingRetry: failed }, { headers: { 'Cache-Control': 'no-store' } });
}

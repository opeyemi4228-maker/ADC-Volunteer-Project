import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLimitedBody } from '../lib/request-body.js';
import { byteRange } from '../lib/objects.js';
import { productionConfig } from '../lib/production-config.js';

test('stream limits are enforced without trusting Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(10)); }, cancel() { cancelled = true; } });
  const request = new Request('https://example.com', { method: 'POST', body: stream, duplex: 'half' });
  await assert.rejects(readLimitedBody(request, 15), RangeError);
  assert.equal(cancelled, true);
  assert.equal((await readLimitedBody(new Request('https://example.com', { method: 'POST', body: 'test' }), 4)).toString(), 'test');
  await assert.rejects(readLimitedBody(new Request('https://example.com', { method: 'POST', body: 'test', headers: { 'content-length': '1000' } }), 4), RangeError);
});

test('byte ranges support suffixes and reject invalid or unsatisfiable ranges', () => {
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=20-', 100), { start: 20, end: 99 });
  assert.deepEqual(byteRange('bytes=0-1000', 100), { start: 0, end: 99 });
  for (const value of ['bytes=100-', 'bytes=10-2', 'bytes=-0', 'bytes=foo-', 'bytes=0-1,4-5', 'items=0-1']) assert.equal(byteRange(value, 100), false);
});

test('production preflight flags missing requirements and retains the explicit OTP exception', () => {
  assert.ok(productionConfig({}).errors.length > 5);
  const env = { APP_SECRET: 'x'.repeat(48), SITE_URL: 'https://example.com', APP_DATABASE_URL: 'postgres://test', STORAGE_BACKEND: 'r2', R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'private', SMTP_URL: 'smtps://example.com', EMAIL_FROM: 'noreply@example.com', CRON_SECRET: 'x'.repeat(48), SMS_PROVIDER: 'console', NEXT_PUBLIC_RECAPTCHA_SITE_KEY: 'site', RECAPTCHA_SECRET_KEY: 'secret' };
  assert.deepEqual(productionConfig(env).errors, []);
  assert.equal(productionConfig(env).warnings.length, 1);
  assert.ok(productionConfig({ ...env, DATABASE_URL: 'owner' }).errors.length);
});

test('browser writes require the configured origin, while signed webhook paths are exempt', async () => {
  const { unsafeOrigin } = await import('../lib/request-origin.js');
  const request = (origin, path = '/api/v1/auth/signout') => new Request(`https://app.example.com${path}`, { method: 'POST', headers: { origin } });
  assert.equal(unsafeOrigin(request('https://app.example.com'), 'https://app.example.com'), false);
  assert.equal(unsafeOrigin(request('https://evil.example.com'), 'https://app.example.com'), true);
  assert.equal(unsafeOrigin(request('null'), 'https://app.example.com'), true);
  assert.equal(unsafeOrigin(request('https://provider.example.com', '/api/v1/whatsapp/webhook'), 'https://app.example.com'), false);
});

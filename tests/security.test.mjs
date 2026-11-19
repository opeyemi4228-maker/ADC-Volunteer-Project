import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PGLITE_DIR = 'memory://';
process.env.APP_SECRET = 'isolated-security-test-secret';
process.env.SMS_PROVIDER = 'console';
delete process.env.SMTP_URL;
for (const key of ['DATABASE_URL', 'DATABASE_URL_POOLED', 'APP_DATABASE_URL']) delete process.env[key];
let db, crypto, otp, notify, storage, reset;
before(async () => {
  db = await import('../lib/db.js');
  crypto = await import('../lib/crypto.js');
  otp = await import('../lib/otp.js');
  notify = await import('../lib/notify.js');
  storage = await import('../lib/storage.js');
  reset = await import('../lib/password-reset.js');
});
after(() => db.closeDb());

async function code(phone, expires = '2099-01-01 00:00:00') {
  await db.run(`INSERT INTO otp_codes (id, phone_hash, purpose, code_hash, expires_at)
    VALUES (:id, :h, 'status', :code, :exp)`,
  { id: crypto.uuid(), h: crypto.blind(phone), code: crypto.hashCode('123456'), exp: expires });
}

test('a one-time code succeeds only once under concurrent requests', async () => {
  const phone = '+2348091112200';
  await code(phone);
  const results = await Promise.all(Array.from({ length: 8 }, () => otp.verifyOtp(phone, '123456', 'status')));
  assert.equal(results.filter(r => r.ok).length, 1);
});

test('concurrent wrong codes exhaust exactly five attempts', async () => {
  const phone = '+2348091112201';
  await code(phone);
  await Promise.all(Array.from({ length: 8 }, () => otp.verifyOtp(phone, '000000', 'status')));
  assert.equal(await db.scalar('SELECT attempts FROM otp_codes WHERE phone_hash = :h', { h: crypto.blind(phone) }), 5);
  assert.equal((await otp.verifyOtp(phone, '123456', 'status')).ok, false);
});

test('expired and wrong-purpose codes cannot authenticate', async () => {
  await code('+2348091112202', '2000-01-01 00:00:00');
  assert.equal((await otp.verifyOtp('+2348091112202', '123456', 'status')).ok, false);
  await code('+2348091112203');
  assert.equal((await otp.verifyOtp('+2348091112203', '123456', 'register')).ok, false);
});

test('authentication messages do not persist codes or reset links', async () => {
  await notify.send({ to: '+2348091112204', template: 'otp', vars: { code: '918273' } });
  await notify.sendEmail({ to: 'test@example.com', subject: 'Reset', heading: 'Reset', paragraphs: [], button: { label: 'Reset', href: 'https://example.com/reset?token=secret-reset-value' }, template: 'password_reset' });
  const rows = await db.all('SELECT body FROM outbox');
  assert.ok(rows.length >= 2);
  assert.ok(rows.every(r => !/918273|secret-reset-value/.test(r.body)));
});

test('temporary SMS simulation remains available; production email needs SMTP', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await notify.send({ to: '+2348091112205', template: 'otp', vars: { code: '102938' } });
    await notify.sendEmail({ to: 'prod@example.com', subject: 'Reset', heading: 'Reset', paragraphs: [], template: 'password_reset' });
    const rows = await db.all("SELECT status FROM outbox WHERE to_hash IN (:sms, :email)", { sms: crypto.blind('+2348091112205'), email: crypto.blind('prod@example.com') });
    assert.equal(rows.length, 2);
    assert.equal(await db.scalar('SELECT status FROM outbox WHERE to_hash = :h', { h: crypto.blind('+2348091112205') }), 'sent');
    assert.equal(await db.scalar('SELECT status FROM outbox WHERE to_hash = :h', { h: crypto.blind('prod@example.com') }), 'failed');
  } finally { if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev; }
});

test('storage keys reject traversal, absolute paths and ambiguous characters', () => {
  for (const key of ['../secret', 'media/../../secret', '/etc/passwd', 'media\\..\\secret', 'media/a?b', '', null, 'media//image.jpg']) {
    assert.throws(() => storage.objectPath(key), /Invalid storage key/);
  }
  assert.equal(storage.objectPath('media/2026-11-17/image-320.jpg'), path.join(storage.STORAGE_DIR, 'media/2026-11-17/image-320.jpg'));
});

test('production cannot fall back to a development secret file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-review-'));
  fs.writeFileSync(path.join(dir, '.secret'), 'development-only');
  try {
    const env = { ...process.env, NODE_ENV: 'production', DATA_DIR: dir };
    delete env.APP_SECRET;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'import { seal } from "./lib/crypto.js"; seal("test");'], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /APP_SECRET must be set in production/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('password reset is single-use and revokes authenticated sessions', async () => {
  await db.run("INSERT INTO users (id, name, phone_enc, phone_hash, password_hash) VALUES ('reset-user', 'Test', 'sealed', 'reset-phone', :pw)", { pw: crypto.hashPassword('OldPassword123!') });
  await db.run("INSERT INTO sessions (id, kind, user_id, mfa_ok, expires_at) VALUES ('reset-session', 'user', 'reset-user', 1, '2099-01-01')");
  await db.run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ('reset-token', 'reset-user', '2099-01-01')");
  const results = await Promise.all(Array.from({ length: 4 }, () => reset.resetPassword('reset-token', 'NewPassword123!', 'test')));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await db.scalar("SELECT count(*) FROM sessions WHERE user_id = 'reset-user'"), 0);
  assert.ok(crypto.verifyPassword('NewPassword123!', await db.scalar("SELECT password_hash FROM users WHERE id = 'reset-user'")));
  assert.equal(await db.scalar("SELECT count(*) FROM audit_log WHERE action = 'password_reset' AND entity_id = 'reset-user'"), 1);
});

test('resetting one link invalidates all outstanding links for that account', async () => {
  for (const key of ['reset-link-a', 'reset-link-b']) await db.run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (:key, 'reset-user', '2099-01-01')", { key });
  const results = await Promise.all(['reset-link-a', 'reset-link-b'].map(key => reset.resetPassword(key, 'ChangedAgain123!', 'test')));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await db.scalar("SELECT count(*) FROM password_resets WHERE user_id = 'reset-user' AND used_at IS NULL"), 0);
});

test('deletion disables the account and revokes user sessions, roles and reset links', async () => {
  const phoneHash = crypto.blind('+2348091112299');
  await db.run("INSERT INTO users (id, name, phone_enc, phone_hash, email_enc, email_hash, password_hash) VALUES ('erase-user', 'Erase Me', :phone, :hash, :email, :eh, :pw)", { phone: crypto.seal('+2348091112299'), hash: phoneHash, email: crypto.seal('erase@example.com'), eh: crypto.blind('erase@example.com'), pw: crypto.hashPassword('ErasePassword123!') });
  await db.run("INSERT INTO sessions (id, kind, user_id, mfa_ok, expires_at) VALUES ('erase-session', 'user', 'erase-user', 1, '2099-01-01')");
  await db.run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ('erase-link', 'erase-user', '2099-01-01')");
  await db.run("INSERT INTO role_assignments (id, user_id, role, area_type, area_code) VALUES ('erase-role', 'erase-user', 'volunteer', 'volunteer', 'record')");
  const { eraseSubject } = await import('../lib/erase.js');
  await eraseSubject(phoneHash);
  const user = await db.one("SELECT * FROM users WHERE id = 'erase-user'");
  assert.equal(user.active, 0);
  assert.equal(user.name, 'Deleted person');
  assert.equal(user.email_enc, null);
  assert.equal(user.email_hash, null);
  assert.equal(crypto.verifyPassword('ErasePassword123!', user.password_hash), false);
  for (const table of ['sessions', 'password_resets', 'role_assignments']) assert.equal(await db.scalar(`SELECT count(*) FROM ${table} WHERE user_id = 'erase-user'`), 0);
});

test('database-backed rate limits hold under concurrent requests', async () => {
  const { takeRateLimit } = await import('../lib/rate-limit.js');
  const results = await Promise.all(Array.from({ length: 12 }, () => takeRateLimit('test', 'one-client', 5, 3600)));
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(await takeRateLimit('test', 'another-client', 5, 3600), true);
});

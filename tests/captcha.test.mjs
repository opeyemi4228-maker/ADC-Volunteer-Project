import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory://';
process.env.APP_SECRET = 'isolated-captcha-test-secret';
for (const key of ['DATABASE_URL', 'DATABASE_URL_POOLED', 'APP_DATABASE_URL', 'RECAPTCHA_SECRET_KEY', 'RECAPTCHA_MIN_SCORE']) delete process.env[key];

let captcha, config;
before(async () => {
  captcha = await import('../lib/captcha.js');
  config = await import('../lib/production-config.js');
});
after(() => { delete process.env.RECAPTCHA_SECRET_KEY; delete process.env.RECAPTCHA_MIN_SCORE; });

const google = (reply, seen = []) => async (url, init) => {
  seen.push({ url, form: Object.fromEntries(init.body) });
  return { json: async () => reply };
};

test('captcha is skipped when no secret is configured (local development)', async () => {
  delete process.env.RECAPTCHA_SECRET_KEY;
  const r = await captcha.verifyCaptcha(undefined, 'register', '1.2.3.4', { fetchImpl: () => assert.fail('must not call Google') });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
});

test('captcha requires a token once configured', async () => {
  process.env.RECAPTCHA_SECRET_KEY = 'secret';
  const r = await captcha.verifyCaptcha('', 'register', '1.2.3.4', { fetchImpl: () => assert.fail('must not call Google') });
  assert.deepEqual(r, { ok: false, reason: 'missing' });
});

test('captcha accepts a human score for the right action and sends secret and IP', async () => {
  process.env.RECAPTCHA_SECRET_KEY = 'secret';
  const seen = [];
  const r = await captcha.verifyCaptcha('tok', 'register', '1.2.3.4', { fetchImpl: google({ success: true, action: 'register', score: 0.9 }, seen) });
  assert.equal(r.ok, true);
  assert.equal(seen[0].url, 'https://www.google.com/recaptcha/api/siteverify');
  assert.deepEqual(seen[0].form, { secret: 'secret', response: 'tok', remoteip: '1.2.3.4' });
});

test('captcha refuses low scores, other actions and failed tokens', async () => {
  process.env.RECAPTCHA_SECRET_KEY = 'secret';
  const low = await captcha.verifyCaptcha('tok', 'register', 'local', { fetchImpl: google({ success: true, action: 'register', score: 0.1 }) });
  assert.equal(low.reason, 'low-score');
  const wrong = await captcha.verifyCaptcha('tok', 'register', 'local', { fetchImpl: google({ success: true, action: 'signin', score: 0.9 }) });
  assert.equal(wrong.reason, 'action-mismatch');
  const bad = await captcha.verifyCaptcha('tok', 'register', 'local', { fetchImpl: google({ success: false, 'error-codes': ['timeout-or-duplicate'] }) });
  assert.equal(bad.reason, 'timeout-or-duplicate');
  process.env.RECAPTCHA_MIN_SCORE = '0.05';
  const lenient = await captcha.verifyCaptcha('tok', 'register', 'local', { fetchImpl: google({ success: true, action: 'register', score: 0.1 }) });
  assert.equal(lenient.ok, true);
  delete process.env.RECAPTCHA_MIN_SCORE;
});

test('captcha lets requests through when Google cannot be reached', async () => {
  process.env.RECAPTCHA_SECRET_KEY = 'secret';
  const r = await captcha.verifyCaptcha('tok', 'register', 'local', { fetchImpl: async () => { throw new Error('network down'); } });
  assert.equal(r.ok, true);
  assert.equal(r.unavailable, true);
});

test('production config requires both reCAPTCHA keys', () => {
  const { errors } = config.productionConfig({});
  assert.ok(errors.some((e) => e.includes('RECAPTCHA_SECRET_KEY')));
  const { errors: ok } = config.productionConfig({ NEXT_PUBLIC_RECAPTCHA_SITE_KEY: 'a', RECAPTCHA_SECRET_KEY: 'b' });
  assert.ok(!ok.some((e) => e.includes('RECAPTCHA')));
});

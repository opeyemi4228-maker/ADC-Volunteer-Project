import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let sms, config;
before(async () => {
  sms = await import('../lib/sms.js');
  config = await import('../lib/production-config.js');
});

/** A fake fetch that answers each call in turn and records what was sent. */
function fake(replies, seen = []) {
  return async (url, init) => {
    seen.push({ url, headers: init.headers, body: init.body });
    const [status, data] = replies.shift();
    return { ok: status >= 200 && status < 300, status, json: async () => data };
  };
}
const form = (body) => Object.fromEntries(new URLSearchParams(body));
const twilioEnv = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_VERIFY_SERVICE_SID: 'VA1' };

test('console is the default and keeps codes on screen', () => {
  assert.deepEqual(sms.smsProviders({}), ['console']);
  assert.equal(sms.otpProvider({}), 'sms');
  assert.equal(sms.isConsoleOnly({}), true);
  assert.equal(sms.isConsoleOnly({ OTP_PROVIDER: 'twilio_verify' }), false);
  assert.equal(sms.isConsoleOnly({ SMS_PROVIDER: 'africastalking' }), false);
});

test('Twilio Verify start sends E.164 number, sms channel and basic auth', async () => {
  const seen = [];
  const sid = await sms.twilioVerifyStart('+2348031234567', 'yo', { env: twilioEnv, fetchImpl: fake([[201, { sid: 'VE123', status: 'pending' }]], seen) });
  assert.equal(sid, 'VE123');
  assert.equal(seen[0].url, 'https://verify.twilio.com/v2/Services/VA1/Verifications');
  assert.deepEqual(form(seen[0].body), { To: '+2348031234567', Channel: 'sms', Locale: 'en' });
  assert.equal(seen[0].headers.Authorization, `Basic ${Buffer.from('AC1:tok').toString('base64')}`);
});

test('Twilio Verify start throws on refusal so the caller can fall back', async () => {
  await assert.rejects(sms.twilioVerifyStart('+2348031234567', 'en', { env: twilioEnv, fetchImpl: fake([[429, { message: 'Max send attempts reached' }]]) }), /Max send attempts/);
});

test('Twilio Verify check: approved, wrong, gone, and unreachable', async () => {
  const seen = [];
  const f = fake([[200, { status: 'approved' }], [200, { status: 'pending' }], [404, { message: 'not found' }], [500, {}]], seen);
  assert.equal(await sms.twilioVerifyCheck('VE1', '123456', { env: twilioEnv, fetchImpl: f }), 'approved');
  assert.deepEqual(form(seen[0].body), { VerificationSid: 'VE1', Code: '123456' });
  assert.equal(await sms.twilioVerifyCheck('VE1', '000000', { env: twilioEnv, fetchImpl: f }), 'wrong');
  assert.equal(await sms.twilioVerifyCheck('VE1', '000000', { env: twilioEnv, fetchImpl: f }), 'gone');
  await assert.rejects(sms.twilioVerifyCheck('VE1', '000000', { env: twilioEnv, fetchImpl: f }));
});

test("Africa's Talking sends with apiKey header and sender ID", async () => {
  const seen = [];
  const env = { SMS_PROVIDER: 'africastalking', AT_USERNAME: 'adc', AT_API_KEY: 'k', AT_SENDER_ID: 'ADC' };
  const r = await sms.sendSms('+2348031234567', 'hello', { env, fetchImpl: fake([[201, { SMSMessageData: { Recipients: [{ statusCode: 101, status: 'Success', messageId: 'ATX1' }] } }]], seen) });
  assert.deepEqual(r, { provider: 'africastalking', messageId: 'ATX1' });
  assert.equal(seen[0].url, 'https://api.africastalking.com/version1/messaging');
  assert.equal(seen[0].headers.apiKey, 'k');
  assert.deepEqual(form(seen[0].body), { username: 'adc', to: '+2348031234567', message: 'hello', from: 'ADC' });
});

test('failover: a rejected gateway hands the message to the next one', async () => {
  const seen = [];
  const env = { SMS_PROVIDER: 'africastalking,termii', AT_USERNAME: 'adc', AT_API_KEY: 'k', TERMII_API_KEY: 't', TERMII_SENDER_ID: 'ADC' };
  const r = await sms.sendSms('+2348031234567', 'hi', { env, fetchImpl: fake([
    [201, { SMSMessageData: { Recipients: [{ statusCode: 406, status: 'UserInBlacklist' }] } }],
    [200, { message_id: 'T1' }],
  ], seen) });
  assert.deepEqual(r, { provider: 'termii', messageId: 'T1' });
  assert.equal(JSON.parse(seen[1].body).to, '2348031234567');
});

test('every gateway failing throws with all reasons', async () => {
  const env = { SMS_PROVIDER: 'twilio,nope', ...twilioEnv, TWILIO_FROM: 'ADC' };
  await assert.rejects(sms.sendSms('+2348031234567', 'hi', { env, fetchImpl: fake([[400, { message: 'bad To' }]]) }), /bad To.*nope/);
});

test('production config validates the OTP and SMS settings', () => {
  const base = { APP_SECRET: 'x'.repeat(48), SITE_URL: 'https://example.com', APP_DATABASE_URL: 'postgres://t', STORAGE_BACKEND: 'r2', R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 't', R2_SECRET_ACCESS_KEY: 't', R2_BUCKET: 'b', SMTP_URL: 'smtps://e', EMAIL_FROM: 'n@example.com', CRON_SECRET: 'x'.repeat(48), NEXT_PUBLIC_RECAPTCHA_SITE_KEY: 's', RECAPTCHA_SECRET_KEY: 's' };
  assert.deepEqual(config.productionConfig({ ...base, OTP_PROVIDER: 'twilio_verify', ...twilioEnv, SMS_PROVIDER: 'africastalking', AT_USERNAME: 'adc', AT_API_KEY: 'k', AT_SENDER_ID: 'ADC' }).errors, []);
  const bad = config.productionConfig({ ...base, OTP_PROVIDER: 'twilio_verify', SMS_PROVIDER: 'africastalking,carrierpigeon' }).errors.join('\n');
  assert.match(bad, /TWILIO_ACCOUNT_SID/);
  assert.match(bad, /TWILIO_VERIFY_SERVICE_SID/);
  assert.match(bad, /AT_USERNAME/);
  assert.match(bad, /carrierpigeon/);
});

test('a code is shown on screen only when no real sender is set up', () => {
  assert.equal(sms.consoleCodeAction({}), 'show');
  assert.equal(sms.consoleCodeAction({ SMS_PROVIDER: 'console' }), 'show');
  // Twilio Verify is on but failed and fell back to console: never show it.
  assert.equal(sms.consoleCodeAction({ OTP_PROVIDER: 'twilio_verify', SMS_PROVIDER: 'console', ...twilioEnv }), 'fail');
  assert.equal(sms.consoleCodeAction({ SMS_PROVIDER: 'termii,console' }), 'fail');
});

test('Twilio Verify: a transient failure is retried once, then succeeds', async () => {
  const seen = [];
  const sid = await sms.twilioVerifyStart('+2348031234567', 'en', { env: twilioEnv, retryDelayMs: 0, fetchImpl: fake([[503, { code: 20503, message: 'busy' }], [201, { sid: 'VE9' }]], seen) });
  assert.equal(sid, 'VE9');
  assert.equal(seen.length, 2);
});

test('Twilio Verify: a network error is retried once, then reported as transient', async () => {
  let calls = 0;
  const down = async () => { calls += 1; throw new TypeError('fetch failed'); };
  const err = await sms.twilioVerifyStart('+2348031234567', 'en', { env: twilioEnv, retryDelayMs: 0, fetchImpl: down }).catch((e) => e);
  assert.equal(calls, 2);
  assert.ok(err instanceof sms.TwilioError && err.transient);
  assert.equal(sms.otpRefusal(err), null, 'transient failures fall back instead of refusing');
});

test('Twilio Verify: definite refusals are not retried and get a clear message', async () => {
  const seen = [];
  const err = await sms.twilioVerifyStart('+2348031234567', 'en', { env: twilioEnv, retryDelayMs: 0, fetchImpl: fake([[429, { code: 60203, message: 'Max send attempts reached' }]], seen) }).catch((e) => e);
  assert.equal(seen.length, 1);
  assert.equal(err.code, 60203);
  assert.deepEqual(sms.otpRefusal(err), { status: 429, error: 'Too many codes were sent to this number. Wait 10 minutes, then try again.' });
  const invalid = await sms.twilioVerifyStart('+2348031234567', 'en', { env: twilioEnv, fetchImpl: fake([[400, { code: 60200, message: 'Invalid parameter' }]]) }).catch((e) => e);
  assert.match(sms.otpRefusal(invalid).error, /can't receive a code/);
  const unknown = await sms.twilioVerifyStart('+2348031234567', 'en', { env: twilioEnv, fetchImpl: fake([[400, { code: 99999, message: '?' }]]) }).catch((e) => e);
  assert.equal(sms.otpRefusal(unknown), null);
});

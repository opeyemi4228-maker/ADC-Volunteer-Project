/**
 * SMS health check and live test for Twilio Verify.
 *
 *   npm run sms:check                         account, balance, service, recent deliveries
 *   npm run sms:check -- --send 08031234567   send a real code to that phone
 *   npm run sms:check -- --check VE… 123456   check the code that arrived
 *
 * Reads the production settings (.env.production). Phone numbers are shown
 * with only their last four digits.
 */
import { twilioVerifyStart, twilioVerifyCheck, otpProvider, otpRefusal } from '../lib/sms.js';
import { normalizePhone } from '../lib/validate.js';

const env = process.env;
const args = process.argv.slice(2);
const mask = (p) => (p ? `…${String(p).slice(-4)}` : '?');
const auth = `Basic ${Buffer.from(`${env.TWILIO_API_KEY_SID || env.TWILIO_ACCOUNT_SID}:${env.TWILIO_API_KEY_SECRET || env.TWILIO_AUTH_TOKEN}`).toString('base64')}`;
const get = async (url) => {
  const res = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(15_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.code ?? ''} ${data.message ?? ''}`.trim());
  return data;
};
const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => { console.log(`  ⚠ ${m}`); process.exitCode = process.exitCode || 2; };
const bad = (m) => { console.log(`  ✖ ${m}`); process.exitCode = 1; };

if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_VERIFY_SERVICE_SID) {
  console.error('TWILIO_ACCOUNT_SID and TWILIO_VERIFY_SERVICE_SID must be set (in .env.production).');
  process.exit(1);
}

if (args[0] === '--send') {
  const phone = normalizePhone(args[1]);
  if (!phone) { console.error('Give a Nigerian mobile number, e.g. --send 08031234567'); process.exit(1); }
  try {
    const sid = await twilioVerifyStart(phone, 'en');
    console.log(`Code sent to ${mask(phone)}. When it arrives, run:\n  npm run sms:check -- --check ${sid} <code>`);
  } catch (error) {
    console.error(`Not sent: ${error.message}`);
    const r = otpRefusal(error);
    if (r) console.error(`A visitor would see: "${r.error}"`);
    process.exit(1);
  }
} else if (args[0] === '--check') {
  const [sid, code] = args.slice(1);
  if (!sid || !code) { console.error('Usage: --check VE… 123456'); process.exit(1); }
  const result = await twilioVerifyCheck(sid, code);
  console.log({ approved: '✔ Code accepted. SMS codes work end to end.', wrong: '✖ That code is wrong. Try again with the code in the SMS.', gone: '✖ That verification has expired, was already used, or had too many wrong tries.' }[result]);
  process.exitCode = result === 'approved' ? 0 : 1;
} else {
  console.log('Twilio account');
  try {
    const acct = await get(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}.json`);
    acct.status === 'active' ? ok('Account is active') : bad(`Account status is "${acct.status}"`);
    acct.type === 'Full' ? ok('Upgraded (not a trial)') : bad('Still a trial account: codes only reach verified numbers. Upgrade in the Twilio Console.');
    const bal = await get(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Balance.json`);
    const amount = Number(bal.balance);
    amount >= 10 ? ok(`Balance ${bal.currency} ${amount.toFixed(2)}`) : warn(`Balance is low: ${bal.currency} ${amount.toFixed(2)}. Top up and turn on auto-recharge (Billing).`);
  } catch (error) { bad(`Can't read the account: ${error.message}. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.`); }

  console.log('\nVerify service');
  try {
    const svc = await get(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}`);
    ok(`"${svc.friendly_name}" (texts read "Your ${svc.friendly_name} verification code is: …")`);
    svc.code_length === 6 ? ok('6-digit codes') : bad(`Code length is ${svc.code_length}; the website expects 6. Change it in the service settings.`);
    svc.do_not_share_warning_enabled ? ok('"Do not share" warning is on') : warn('"Do not share this code" warning is off. Turn it on in the service settings.');
  } catch (error) { bad(`Can't read the Verify service: ${error.message}. Check TWILIO_VERIFY_SERVICE_SID.`); }
  otpProvider() === 'twilio_verify' ? ok('OTP_PROVIDER=twilio_verify') : bad(`OTP_PROVIDER is "${otpProvider()}"; set it to twilio_verify.`);

  console.log('\nRecent codes (newest first)');
  try {
    const { attempts = [] } = await get(`https://verify.twilio.com/v2/Attempts?VerifyServiceSid=${env.TWILIO_VERIFY_SERVICE_SID}&PageSize=20`);
    if (!attempts.length) console.log('  None yet. Send a test: npm run sms:check -- --send 080…');
    for (const a of attempts) {
      const cd = a.channel_data ?? {};
      const delivery = cd.status ?? cd.message_status ?? '';
      const err = cd.error_code ? ` error ${cd.error_code}` : '';
      console.log(`  ${String(a.date_created).replace('T', ' ').slice(0, 16)}  ${mask(cd.to)}  ${a.conversion_status === 'converted' ? 'code entered ✔' : 'not entered  '}  ${delivery}${err}`);
    }
    if (attempts.length >= 5) {
      const rate = attempts.filter((a) => a.conversion_status === 'converted').length / attempts.length;
      const pct = `${Math.round(rate * 100)}% of the last ${attempts.length} codes were entered`;
      rate >= 0.6 ? ok(pct) : warn(`${pct}. Under 60% can mean texts aren't arriving: check Monitor → Logs → Errors in Twilio.`);
    }
  } catch (error) { warn(`Can't read recent attempts: ${error.message}`); }
}

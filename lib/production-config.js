const list = (v) => String(v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function smsConfig(env, errors, warnings) {
  const sms = list(env.SMS_PROVIDER).length ? list(env.SMS_PROVIDER) : ['console'];
  const otp = list(env.OTP_PROVIDER)[0] ?? 'sms';
  const twilioCreds = () => {
    if (!env.TWILIO_ACCOUNT_SID) errors.push('TWILIO_ACCOUNT_SID is required for Twilio.');
    if (!env.TWILIO_AUTH_TOKEN && !(env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET)) errors.push('Set TWILIO_AUTH_TOKEN, or TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET.');
  };
  if (!['sms', 'twilio_verify'].includes(otp)) errors.push(`OTP_PROVIDER "${otp}" is not implemented; use "twilio_verify" or "sms".`);
  if (otp === 'twilio_verify') {
    twilioCreds();
    if (!env.TWILIO_VERIFY_SERVICE_SID) errors.push('TWILIO_VERIFY_SERVICE_SID is required when OTP_PROVIDER=twilio_verify.');
  }
  if (sms[0] === 'console') {
    if (otp === 'twilio_verify') warnings.push('SMS_PROVIDER=console: codes go by Twilio Verify, but other texts are only recorded, and codes appear on screen if Twilio Verify is down.');
    else warnings.push('Temporary on-screen OTP is enabled as requested. It does not establish phone ownership.');
  }
  for (const name of sms) {
    if (name === 'console') continue;
    if (name === 'africastalking') {
      if (!env.AT_USERNAME || !env.AT_API_KEY) errors.push('AT_USERNAME and AT_API_KEY are required when SMS_PROVIDER includes africastalking.');
      if (env.AT_USERNAME === 'sandbox') errors.push('AT_USERNAME=sandbox does not deliver real messages.');
      if (!env.AT_SENDER_ID) warnings.push('AT_SENDER_ID is empty: Africa\'s Talking will use a shared sender, which Nigerian DND numbers may not receive.');
    } else if (name === 'twilio') {
      twilioCreds();
      if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM) errors.push('TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM is required when SMS_PROVIDER includes twilio.');
    } else if (name === 'termii') {
      if (!env.TERMII_API_KEY) errors.push('TERMII_API_KEY is required when SMS_PROVIDER includes termii.');
      if (!env.TERMII_SENDER_ID) errors.push('TERMII_SENDER_ID is required when SMS_PROVIDER includes termii (an approved Termii sender ID).');
    } else errors.push(`SMS_PROVIDER "${name}" is not implemented; use africastalking, twilio, termii or console.`);
  }
}

/** Offline validation only: never prints secrets or contacts services. */
export function productionConfig(env = process.env) {
  const errors = [], warnings = [];
  if (!env.APP_SECRET || env.APP_SECRET.length < 32) errors.push('APP_SECRET must be at least 32 characters; preserve the existing encryption key when real data exists.');
  try {
    const site = new URL(env.SITE_URL);
    if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/') throw new Error();
  } catch { errors.push('SITE_URL must be the HTTPS origin of your deployed app.'); }
  if (!env.APP_DATABASE_URL) errors.push('Set APP_DATABASE_URL to the limited Neon app-role connection string.');
  if (env.DATABASE_URL || env.DATABASE_URL_POOLED) errors.push('Do not deploy owner database credentials; use APP_DATABASE_URL only.');
  if (env.STORAGE_BACKEND !== 'r2') errors.push('Set STORAGE_BACKEND=r2 for durable uploads on Vercel.');
  for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) if (!env[key]) errors.push(`${key} is required.`);
  if (env.R2_ACCOUNT_ID && !/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID)) errors.push('R2_ACCOUNT_ID must be a 32-character account identifier.');
  if (!env.SMTP_URL) errors.push('SMTP_URL is required for password-reset email.');
  if (!env.EMAIL_FROM || env.EMAIL_FROM.includes('adc.example')) errors.push('EMAIL_FROM must use your verified sender address.');
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) errors.push('CRON_SECRET must be at least 32 characters for maintenance authentication.');
  smsConfig(env, errors, warnings);
  if (!env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || !env.RECAPTCHA_SECRET_KEY) errors.push('Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY (reCAPTCHA v3) so the public forms are protected from bots.');
  if (env.RECAPTCHA_MIN_SCORE && !(Number(env.RECAPTCHA_MIN_SCORE) >= 0 && Number(env.RECAPTCHA_MIN_SCORE) <= 1)) errors.push('RECAPTCHA_MIN_SCORE must be between 0 and 1.');
  if (env.SEED_DEMO === '1') errors.push('Disable SEED_DEMO in production.');
  return { errors, warnings };
}

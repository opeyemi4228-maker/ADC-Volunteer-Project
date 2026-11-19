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
  if (!env.SMS_PROVIDER || env.SMS_PROVIDER === 'console') warnings.push('Temporary on-screen OTP is enabled as requested. It does not establish phone ownership.');
  else if (env.SMS_PROVIDER === 'termii') {
    if (!env.TERMII_API_KEY) errors.push('TERMII_API_KEY is required when SMS_PROVIDER=termii.');
    if (!env.TERMII_SENDER_ID) errors.push('TERMII_SENDER_ID is required when SMS_PROVIDER=termii (an approved Termii sender ID).');
  } else errors.push(`SMS_PROVIDER "${env.SMS_PROVIDER}" is not implemented; use "termii" or "console".`);
  if (!env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || !env.RECAPTCHA_SECRET_KEY) errors.push('Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY (reCAPTCHA v3) so the public forms are protected from bots.');
  if (env.RECAPTCHA_MIN_SCORE && !(Number(env.RECAPTCHA_MIN_SCORE) >= 0 && Number(env.RECAPTCHA_MIN_SCORE) <= 1)) errors.push('RECAPTCHA_MIN_SCORE must be between 0 and 1.');
  if (env.SEED_DEMO === '1') errors.push('Disable SEED_DEMO in production.');
  return { errors, warnings };
}

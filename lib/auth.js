import { cookies, headers } from "next/headers";

import { all, one, run, nowIso } from "./db.js";
import { seal, open, blind, token, uuid, hashCode, otpCode } from "./crypto.js";
import { send, isConsoleProvider } from "./notify.js";
import { powersFor } from "./scope.js";

/**
 * Sessions, one-time codes and the signed-in viewer.
 *
 * Two kinds of session:
 *   registrant  anyone who proved a phone number by OTP; can resume a draft,
 *               see and change their own records, and nothing else
 *   user        a coordinator account; password + OTP (two factors, spec §15)
 */

const REG_COOKIE = "adc_reg";
const USER_COOKIE = "adc_session";
const OTP_TTL_MIN = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_SENDS_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;

const minutesFromNow = (m) => new Date(Date.now() + m * 60_000).toISOString().replace("T", " ").slice(0, 19);

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/* ── One-time codes ────────────────────────────────────────────────────── */

/**
 * Sends a code. Rate limits: one per 60 s, five per hour per number, and 20
 * per hour per IP address (a device that is cycling through numbers).
 */
export async function requestOtp(phone, purpose, lang = "en") {
  const phoneHash = blind(phone);
  const ip = await clientIp();

  const last = one("SELECT created_at FROM otp_codes WHERE phone_hash = :h ORDER BY created_at DESC LIMIT 1", { h: phoneHash });
  if (last) {
    const wait = OTP_RESEND_SECONDS - (Date.now() - Date.parse(`${last.created_at}Z`)) / 1000;
    if (wait > 0) return { ok: false, retryAfter: Math.ceil(wait), error: `Please wait ${Math.ceil(wait)} seconds before asking for a new code.` };
  }
  const hourAgo = minutesFromNow(-60);
  const sends = one("SELECT COUNT(*) n FROM otp_codes WHERE phone_hash = :h AND created_at > :t", { h: phoneHash, t: hourAgo }).n;
  if (sends >= OTP_MAX_SENDS_PER_HOUR) return { ok: false, error: "Too many codes sent to this number. Try again in an hour." };
  const fromIp = one("SELECT COUNT(*) n FROM otp_codes WHERE ip = :ip AND created_at > :t", { ip, t: hourAgo }).n;
  if (fromIp >= 20 && ip !== "local") return { ok: false, error: "Too many codes requested from this device. Try again later." };

  const code = otpCode();
  run("UPDATE otp_codes SET used_at = :now WHERE phone_hash = :h AND used_at IS NULL", { h: phoneHash, now: nowIso() });
  run(
    `INSERT INTO otp_codes (id, phone_hash, purpose, code_hash, created_at, expires_at, ip)
     VALUES (:id, :h, :purpose, :code, :now, :exp, :ip)`,
    { id: uuid(), h: phoneHash, purpose, code: hashCode(code), now: nowIso(), exp: minutesFromNow(OTP_TTL_MIN), ip },
  );
  await send({ channel: "sms", to: phone, template: "otp", lang, vars: { code } });
  // In development the code is handed back so the site can be tested without a phone.
  return { ok: true, retryAfter: OTP_RESEND_SECONDS, devCode: isConsoleProvider && process.env.NODE_ENV !== "production" ? code : undefined };
}

export function verifyOtp(phone, code, purpose) {
  const row = one(
    "SELECT * FROM otp_codes WHERE phone_hash = :h AND purpose = :purpose AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
    { h: blind(phone), purpose },
  );
  if (!row) return { ok: false, error: "This code has expired. Send a new one.", expired: true };
  if (row.expires_at < nowIso()) return { ok: false, error: "This code has expired. Send a new one.", expired: true };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Too many wrong tries. Send a new code.", expired: true };
  if (row.code_hash !== hashCode(String(code ?? "").trim())) {
    run("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = :id", { id: row.id });
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return {
      ok: false,
      error: left > 0 ? `That code doesn't match. Check the SMS and try again. You have ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Send a new code.",
      expired: left <= 0,
    };
  }
  run("UPDATE otp_codes SET used_at = :now WHERE id = :id", { id: row.id, now: nowIso() });
  return { ok: true };
}

/* ── Sessions ──────────────────────────────────────────────────────────── */

const cookieOptions = (days) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: days * 86400,
});

export async function startRegistrantSession(phone) {
  const id = token();
  run(
    "INSERT INTO sessions (id, kind, phone_enc, phone_hash, mfa_ok, expires_at) VALUES (:id, 'registrant', :enc, :hash, 1, :exp)",
    { id, enc: seal(phone), hash: blind(phone), exp: minutesFromNow(60 * 24 * 30) },
  );
  (await cookies()).set(REG_COOKIE, id, cookieOptions(30));
}

/** The phone-verified person filling in a form, or null. */
export async function getRegistrant() {
  const id = (await cookies()).get(REG_COOKIE)?.value;
  if (!id) return null;
  const s = one("SELECT * FROM sessions WHERE id = :id AND kind = 'registrant' AND expires_at > :now", { id, now: nowIso() });
  if (!s) return null;
  return { phone: open(s.phone_enc), phoneHash: s.phone_hash };
}

export async function endRegistrantSession() {
  const jar = await cookies();
  const id = jar.get(REG_COOKIE)?.value;
  if (id) run("DELETE FROM sessions WHERE id = :id", { id });
  jar.delete(REG_COOKIE);
}

/** Step one of coordinator sign-in: password checked, OTP pending. */
export async function startUserSession(userId, { mfa = false } = {}) {
  const id = token();
  run("INSERT INTO sessions (id, kind, user_id, mfa_ok, expires_at) VALUES (:id, 'user', :u, :mfa, :exp)", {
    id,
    u: userId,
    mfa: mfa ? 1 : 0,
    exp: minutesFromNow(mfa ? 60 * 12 : 15),
  });
  (await cookies()).set(USER_COOKIE, id, cookieOptions(mfa ? 0.5 : 0.02));
  return id;
}

export async function pendingUser() {
  const id = (await cookies()).get(USER_COOKIE)?.value;
  if (!id) return null;
  const s = one("SELECT * FROM sessions WHERE id = :id AND kind = 'user' AND mfa_ok = 0 AND expires_at > :now", { id, now: nowIso() });
  if (!s) return null;
  const user = one("SELECT * FROM users WHERE id = :id AND active = 1", { id: s.user_id });
  return user ? { session: s, user, phone: open(user.phone_enc) } : null;
}

export async function completeUserSession() {
  const jar = await cookies();
  const id = jar.get(USER_COOKIE)?.value;
  const s = one("SELECT * FROM sessions WHERE id = :id AND kind = 'user'", { id });
  if (!s) return false;
  run("DELETE FROM sessions WHERE id = :id", { id });
  run("UPDATE users SET last_signin_at = :now WHERE id = :u", { u: s.user_id, now: nowIso() });
  await startUserSession(s.user_id, { mfa: true });
  return true;
}

export async function endUserSession() {
  const jar = await cookies();
  const id = jar.get(USER_COOKIE)?.value;
  if (id) run("DELETE FROM sessions WHERE id = :id", { id });
  jar.delete(USER_COOKIE);
}

/**
 * The signed-in coordinator with their roles and powers, or null.
 * Plain data only, so it can be handed to client components.
 */
export async function getViewer() {
  const id = (await cookies()).get(USER_COOKIE)?.value;
  if (!id) return null;
  const s = one("SELECT * FROM sessions WHERE id = :id AND kind = 'user' AND mfa_ok = 1 AND expires_at > :now", { id, now: nowIso() });
  if (!s) return null;
  const user = one("SELECT id, name, phone_enc FROM users WHERE id = :id AND active = 1", { id: s.user_id });
  if (!user) return null;
  const roles = all("SELECT role, area_type, area_code FROM role_assignments WHERE user_id = :id", { id: user.id });
  return { id: user.id, name: user.name, phone: open(user.phone_enc), roles, powers: powersFor(roles) };
}

export function can(viewer, power) {
  return Boolean(viewer?.powers?.includes(power));
}

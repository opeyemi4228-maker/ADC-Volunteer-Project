import { one, all, run, nowIso, scalar } from "@/lib/db";
import { blind, verifyPassword } from "@/lib/crypto";
import { requestOtp, verifyOtp, startUserSession, pendingUser, completeUserSession, clientIp } from "@/lib/auth";
import { normalizePhone, normalizeEmail } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

/**
 * Sign-in with an email address or phone number and a password.
 *
 *   POST { login, password }
 *     Volunteer accounts (volunteer role only) are signed straight in: { done: true }.
 *     Campaign coordinators, who can see other people's data, also confirm a code
 *     sent to their phone (spec §15): { codeSent: true }, then POST { code }.
 *
 * Ten failed attempts from one IP in 15 minutes pauses sign-in from there.
 */
export async function POST(request) {
  const input = await body(request);
  const ip = await clientIp();

  if (input.code) {
    const pending = await pendingUser();
    if (!pending) return fail(401, "Your sign-in timed out. Start again.", { restart: true });
    const result = verifyOtp(pending.phone, input.code, "signin");
    if (!result.ok) return fail(400, result.error, { expired: result.expired });
    await completeUserSession();
    audit({ id: pending.user.id, name: pending.user.name }, "signin", "user", pending.user.id, null, ip);
    return ok({ done: true });
  }

  const recent = scalar("SELECT COUNT(*) FROM audit_log WHERE action = 'signin_failed' AND ip = :ip AND timestamp > datetime('now', '-15 minutes')", { ip });
  if (recent >= 10 && ip !== "local") return fail(429, "Too many attempts. Wait 15 minutes and try again.");

  const login = String(input.login ?? input.email ?? input.phone ?? "").trim();
  const email = login.includes("@") ? normalizeEmail(login) : null;
  const phone = email ? null : normalizePhone(login);
  const user = email
    ? one("SELECT * FROM users WHERE email_hash = :h AND active = 1", { h: blind(email) })
    : phone ? one("SELECT * FROM users WHERE phone_hash = :h AND active = 1", { h: blind(phone) }) : null;

  // The same answer for an unknown account and a wrong password.
  if (!user || !verifyPassword(String(input.password ?? ""), user.password_hash)) {
    audit(null, "signin_failed", "user", null, { login: email ? "email" : "phone" }, ip);
    return fail(401, "That email or phone number and password don't match an account.");
  }

  const roles = all("SELECT role FROM role_assignments WHERE user_id = :u", { u: user.id }).map((r) => r.role);
  if (roles.length > 0 && roles.every((r) => r === "volunteer")) {
    await startUserSession(user.id, { mfa: true });
    run("UPDATE users SET last_signin_at = :now WHERE id = :u", { now: nowIso(), u: user.id });
    audit({ id: user.id, name: user.name }, "signin", "user", user.id, { method: "password" }, ip);
    return ok({ done: true });
  }

  const { open } = await import("@/lib/crypto");
  const userPhone = open(user.phone_enc);
  await startUserSession(user.id, { mfa: false });
  const sent = await requestOtp(userPhone, "signin");
  if (!sent.ok) return fail(429, sent.error);
  return ok({ codeSent: true, masked: `…${userPhone.slice(-4)}`, devCode: sent.devCode });
}

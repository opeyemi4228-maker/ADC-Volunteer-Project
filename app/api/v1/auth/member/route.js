import { one, all, run, nowIso, scalar } from "@/lib/db";
import { blind, open } from "@/lib/crypto";
import { volunteerByPhone, createVolunteerAccount } from "@/lib/registration";
import { requestOtp, verifyOtp, startUserSession, clientIp } from "@/lib/auth";
import { normalizePhone, normalizeEmail, formatPhone } from "@/lib/validate";
import { getLang } from "@/lib/i18n/server";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

/**
 * Member (volunteer) sign-in: no password. The one-time code sent by SMS to
 * the phone number they registered with is the only way in.
 *
 *   POST { phone }        → sends a code to that number: { codeSent: true }
 *   POST { phone, code }  → checks it and signs them in: { done: true }
 *
 * The number must match a registered member exactly; nothing is sent otherwise.
 * Members who joined by USSD, WhatsApp or a field agent have no account yet:
 * it is created the first time they prove the number with a code.
 */
async function memberByPhone(phone) {
  const user = await one("SELECT * FROM users WHERE phone_hash = :h", { h: blind(phone) });
  const roles = user ? (await all("SELECT role FROM role_assignments WHERE user_id = :u", { u: user.id })).map((r) => r.role) : [];
  if (user && roles.includes("volunteer")) return user.active ? { user, roles } : null;
  const volunteer = await volunteerByPhone(phone);
  if (!volunteer) return null;
  return { user: user?.active ? user : null, roles, volunteer };
}

export async function POST(request) {
  const input = await body(request);
  const ip = await clientIp();

  const recent = await scalar(`SELECT COUNT(*) FROM audit_log WHERE action = 'signin_failed' AND ip = :ip AND "timestamp" > now() - interval '15 minutes'`, { ip });
  if (recent >= 10 && ip !== "local") return fail(429, "Too many attempts. Wait 15 minutes and try again.");

  const phone = normalizePhone(input.phone);
  if (!phone) return fail(422, "Enter the Nigerian mobile number you registered with, e.g. 0803 123 4567.");

  const member = await memberByPhone(phone);
  // The Super Admin and coordinators who are not volunteers have no member
  // record: send them to the password sign-in rather than "not registered".
  if (!member && await one(
    "SELECT 1 AS x FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE u.phone_hash = :h AND u.active = 1 AND r.role <> 'volunteer' LIMIT 1",
    { h: blind(phone) },
  )) {
    return fail(403, "This number belongs to a campaign coordinator account. Use coordinator sign in with your password.", { coordinator: true });
  }
  if (!member) {
    await audit(null, "signin_failed", "user", null, { login: "member_phone" }, ip);
    return fail(404, "We couldn't find a member registered with this phone number. Check the number you used when you registered.");
  }

  // Coordinators who are also members keep password + code for their coordinator tools.
  if (member.roles.some((r) => r !== "volunteer")) {
    return fail(403, "This number belongs to a campaign coordinator account. Use coordinator sign in with your password.", { coordinator: true });
  }

  if (!input.code) {
    const sent = await requestOtp(phone, "member_signin", await getLang());
    if (!sent.ok) return fail(429, sent.error, { retryAfter: sent.retryAfter });
    return ok({ codeSent: true, display: formatPhone(phone), masked: `…${phone.slice(-4)}`, retryAfter: sent.retryAfter, devCode: sent.devCode });
  }

  const result = await verifyOtp(phone, input.code, "member_signin");
  if (!result.ok) {
    await audit(null, "signin_failed", "user", member.user?.id ?? null, { login: "member_otp" }, ip);
    return fail(400, result.error, { expired: result.expired });
  }

  let userId = member.user?.id;
  let name = member.user?.name;
  if (!userId) {
    const v = member.volunteer;
    name = `${v.first_name} ${v.surname}`.trim();
    // Keep their email on the account only if no other account already uses it.
    const email = normalizeEmail(open(v.email_enc));
    const taken = email && await one("SELECT 1 FROM users WHERE email_hash = :h", { h: blind(email) });
    userId = await createVolunteerAccount(v.id, { name, phone, email: taken ? null : email });
  }

  await startUserSession(userId, { mfa: true });
  await run("UPDATE users SET last_signin_at = :now WHERE id = :u", { now: nowIso(), u: userId });
  await audit({ id: userId, name }, "signin", "user", userId, { method: "otp" }, ip);
  return ok({ done: true });
}

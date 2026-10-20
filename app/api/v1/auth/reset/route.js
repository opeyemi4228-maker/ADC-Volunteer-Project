import crypto from "node:crypto";

import { one, run, nowIso } from "@/lib/db";
import { blind, hashPassword, token } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { normalizeEmail, passwordProblem } from "@/lib/validate";
import { sendEmail, isEmailLive } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

/**
 * Password reset by email.
 *   POST { email }              -> emails a link valid for one hour (always answers "sent")
 *   POST { token, password }    -> sets the new password and signs out other sessions
 */
const SITE = process.env.SITE_URL ?? "http://localhost:3000";
const hashToken = (t) => crypto.createHash("sha256").update(t).digest("base64url");

export async function POST(request) {
  const d = await body(request);
  const ip = await clientIp();

  if (d.token) {
    const row = one("SELECT * FROM password_resets WHERE token_hash = :h AND used_at IS NULL AND expires_at > :now", { h: hashToken(String(d.token)), now: nowIso() });
    if (!row) return fail(400, "This reset link has expired or was already used. Ask for a new one.");
    const problem = passwordProblem(d.password);
    if (problem) return fail(422, problem, { errors: { password: problem } });
    run("UPDATE users SET password_hash = :pw WHERE id = :u", { pw: hashPassword(String(d.password)), u: row.user_id });
    run("UPDATE password_resets SET used_at = :now WHERE token_hash = :h", { now: nowIso(), h: row.token_hash });
    run("DELETE FROM sessions WHERE user_id = :u", { u: row.user_id });
    audit({ id: row.user_id }, "password_reset", "user", row.user_id, null, ip);
    return ok({ done: true });
  }

  const email = normalizeEmail(d.email);
  if (!email) return fail(422, "Enter the email address you registered with.");
  const user = one("SELECT id, name FROM users WHERE email_hash = :h AND active = 1", { h: blind(email) });
  let devLink;
  if (user) {
    const t = token(24);
    const exp = new Date(Date.now() + 3600_000).toISOString().replace("T", " ").slice(0, 19);
    run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (:h, :u, :e)", { h: hashToken(t), u: user.id, e: exp });
    const link = `${SITE}/reset?token=${t}`;
    await sendEmail({
      to: email,
      subject: "Reset your ADC Volunteers System password",
      heading: "Reset your password",
      paragraphs: [`Hello ${user.name.split(" ")[0]},`, "Someone asked to reset the password for this account. If it was you, use the button below within one hour. If not, you can ignore this email; your password has not changed."],
      button: { label: "Choose a new password", href: link },
      template: "password_reset",
    });
    if (!isEmailLive && process.env.NODE_ENV !== "production") devLink = `/reset?token=${t}`;
  }
  audit(null, "password_reset_requested", "user", user?.id ?? null, null, ip);
  // Same answer whether or not the address exists, so nobody can probe for accounts.
  return ok({ sent: true, devLink });
}

import { one, run, tx, nowIso } from "./db.js";
import { hashPassword } from "./crypto.js";
import { audit } from "./audit.js";

/** Consume a reset link, update credentials and revoke sessions atomically. */
export async function resetPassword(tokenHash, password, ip) {
  return tx(async () => {
    // Serialize resets for an account before locking its reset links. This
    // prevents two different outstanding links from both changing a password.
    const candidate = await one("SELECT user_id FROM password_resets WHERE token_hash = :h", { h: tokenHash });
    if (!candidate) return false;
    const user = await one("SELECT id FROM users WHERE id = :u AND active = 1 FOR UPDATE", { u: candidate.user_id });
    if (!user) return false;
    const row = await one(
      "SELECT * FROM password_resets WHERE token_hash = :h AND used_at IS NULL AND expires_at > :now FOR UPDATE",
      { h: tokenHash, now: nowIso() },
    );
    if (!row) return false;
    await run("UPDATE users SET password_hash = :pw WHERE id = :u", { pw: hashPassword(password), u: row.user_id });
    await run("UPDATE password_resets SET used_at = :now WHERE user_id = :u AND used_at IS NULL", { now: nowIso(), u: row.user_id });
    await run("DELETE FROM sessions WHERE user_id = :u", { u: row.user_id });
    await audit({ id: row.user_id }, "password_reset", "user", row.user_id, null, ip);
    return true;
  });
}

import { one, run, tx, nowIso } from "./db.js";
import { blind, hashCode } from "./crypto.js";
import { twilioVerifyCheck } from "./sms.js";

const OTP_MAX_ATTEMPTS = 5;

/** code_hash of a row whose code Twilio Verify holds: "twilio:<VerificationSid>". */
export const VERIFY_PREFIX = "twilio:";

async function codeMatches(row, code) {
  if (!row.code_hash.startsWith(VERIFY_PREFIX)) return row.code_hash === hashCode(code) ? "approved" : "wrong";
  if (!/^\d{4,10}$/.test(code)) return "wrong"; // don't spend a Twilio check on junk
  return twilioVerifyCheck(row.code_hash.slice(VERIFY_PREFIX.length), code);
}

// Lock verification and consumption together: a code is accepted only once.
export async function verifyOtp(phone, code, purpose) {
  return tx(async () => {
    const row = await one(
      "SELECT * FROM otp_codes WHERE phone_hash = :h AND purpose = :purpose AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      { h: blind(phone), purpose },
    );
    if (!row) return { ok: false, error: "This code has expired. Send a new one.", expired: true };
    if (row.expires_at <= nowIso()) return { ok: false, error: "This code has expired. Send a new one.", expired: true };
    if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Too many wrong tries. Send a new code.", expired: true };
    let match;
    try {
      match = await codeMatches(row, String(code ?? "").trim());
    } catch (error) {
      console.error("[otp]", error.message);
      return { ok: false, error: "We couldn't check the code just now. Please try again." };
    }
    if (match === "gone") {
      await run("UPDATE otp_codes SET used_at = :now WHERE id = :id", { id: row.id, now: nowIso() });
      return { ok: false, error: "This code has expired. Send a new one.", expired: true };
    }
    if (match !== "approved") {
      await run("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = :id", { id: row.id });
      const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
      return {
        ok: false,
        error: left > 0 ? `That code doesn't match. Check the text message and try again. You have ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Send a new code.",
        expired: left <= 0,
      };
    }
    await run("UPDATE otp_codes SET used_at = :now WHERE id = :id", { id: row.id, now: nowIso() });
    return { ok: true };
  });
}


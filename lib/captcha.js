/**
 * Google reCAPTCHA v3 (score-based, no checkbox) on the public forms that send
 * an SMS or email, or create a record: registration, member and coordinator
 * sign-in, phone-code requests and password-reset requests.
 *
 * The browser sends its token in the X-Captcha-Token header (components/forms/captcha.js).
 * With RECAPTCHA_SECRET_KEY unset (local development and tests) checks are skipped:
 * the key only works on the registered domain, not localhost.
 */
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export const captchaEnabled = () => Boolean(process.env.RECAPTCHA_SECRET_KEY);

function minScore() {
  const n = Number(process.env.RECAPTCHA_MIN_SCORE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
}

/**
 * Checks a token with Google. Returns { ok, reason?, score? }.
 * If Google can't be reached the request is let through (and logged) so an
 * outage there doesn't stop volunteers registering; the rate limits still apply.
 */
export async function verifyCaptcha(token, action, ip, { fetchImpl = fetch } = {}) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== "string" || token.length > 4096) return { ok: false, reason: "missing" };

  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "local") form.set("remoteip", ip);
  let result;
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    result = await res.json();
  } catch (e) {
    console.warn("[captcha] verification unavailable; allowing request:", e?.message ?? e);
    return { ok: true, unavailable: true };
  }
  if (!result?.success) return { ok: false, reason: (result?.["error-codes"] ?? []).join(",") || "rejected" };
  if (action && result.action !== action) return { ok: false, reason: "action-mismatch" };
  if (typeof result.score === "number" && result.score < minScore()) return { ok: false, reason: "low-score", score: result.score };
  return { ok: true, score: result.score };
}

/** For route handlers: returns a 403 response when the check fails, otherwise null. */
export async function captchaDenied(request, action, ip) {
  const check = await verifyCaptcha(request.headers.get("x-captcha-token"), action, ip);
  if (check.ok) return null;
  return Response.json({ error: "We couldn't confirm you're not an automated program. Refresh the page and try again.", captcha: true }, { status: 403 });
}

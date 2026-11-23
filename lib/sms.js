/**
 * SMS gateways and one-time-code delivery.
 *
 * Two independent settings:
 *
 *   OTP_PROVIDER  how sign-in and registration codes are sent.
 *                 "twilio_verify": Twilio Verify sends and checks the code
 *                 from Twilio's own pre-registered senders (no Nigerian sender
 *                 ID to register, DND handled, SMS-pumping fraud blocked).
 *                 "sms" (default): we make the code and send it through
 *                 SMS_PROVIDER like any other message.
 *                 If Twilio Verify is down, codes fall back to SMS_PROVIDER.
 *
 *   SMS_PROVIDER  every other text (and the fallback for codes). A comma list
 *                 is tried in order, e.g. "africastalking,termii".
 *                 console | africastalking | twilio | termii
 *
 * Every function reads the environment when it runs and takes an optional
 * fetchImpl, so tests can exercise them without a network.
 */

const TIMEOUT = 15_000;
const list = (v) => String(v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const smsProviders = (env = process.env) => (list(env.SMS_PROVIDER).length ? list(env.SMS_PROVIDER) : ["console"]);
export const otpProvider = (env = process.env) => list(env.OTP_PROVIDER)[0] ?? "sms";

/** True when nothing really leaves the building: codes are shown on screen. */
export function isConsoleOnly(env = process.env) {
  return otpProvider(env) !== "twilio_verify" && smsProviders(env)[0] === "console";
}

/**
 * What to do with a one-time code that the "console" gateway accepted.
 * "show": no real sender is set up at all, so the code goes on screen.
 * "fail": a real sender is set up (e.g. Twilio Verify) but could not send,
 * so nothing reached the phone. Showing the code then would let anyone
 * register or sign in as any number, so the request must fail instead.
 */
export const consoleCodeAction = (env = process.env) => (isConsoleOnly(env) ? "show" : "fail");

const twilioAuth = (env) => {
  // An API key (SK…) is preferred; the account auth token also works.
  const user = env.TWILIO_API_KEY_SID || env.TWILIO_ACCOUNT_SID;
  const pass = env.TWILIO_API_KEY_SECRET || env.TWILIO_AUTH_TOKEN;
  if (!env.TWILIO_ACCOUNT_SID || !user || !pass) throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (or an API key) must be set.");
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
};

/**
 * A refusal or failure from Twilio. `code` is Twilio's error code (e.g. 60203),
 * `transient` is true when trying again shortly could work (network trouble,
 * timeouts, Twilio 5xx or its own rate limit), false when it never will.
 */
export class TwilioError extends Error {
  constructor(message, { status = 0, code = null, transient = false } = {}) {
    super(message);
    this.name = "TwilioError";
    this.status = status;
    this.code = code;
    this.transient = transient;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * What to tell the person when Twilio refuses a code, by Twilio error code.
 * Codes not listed (and transient failures) get the general "try again".
 * https://www.twilio.com/docs/api/errors
 */
const OTP_REFUSALS = {
  60200: { status: 422, error: "That number can't receive a code. Check it and try again." },
  21211: { status: 422, error: "That number can't receive a code. Check it and try again." },
  21614: { status: 422, error: "That number can't receive text messages. Use a mobile number." },
  60205: { status: 422, error: "That number can't receive text messages. Use a mobile number." },
  60203: { status: 429, error: "Too many codes were sent to this number. Wait 10 minutes, then try again." },
  60202: { status: 429, error: "Too many wrong tries. Wait 10 minutes, then ask for a new code." },
  21610: { status: 422, error: "This number has blocked our text messages. Reply START to any of our texts, or contact support." },
  60410: { status: 422, error: "We can't send a code to this number right now. Please contact support." },
  60605: { status: 422, error: "We can't send a code to this number right now. Please contact support." },
  21408: { status: 422, error: "We can't send a code to this number right now. Please contact support." },
};

/** The person-facing message for a failed code request, or null to use the general one. */
export function otpRefusal(error) {
  return (error instanceof TwilioError && !error.transient && OTP_REFUSALS[error.code]) || null;
}

async function postForm(fetchImpl, url, headers, form) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/* ── Twilio Verify (codes only) ────────────────────────────────────────── */

const VERIFY_LOCALES = new Set(["en"]); // Twilio has no Hausa, Yoruba, Igbo or Pidgin.

/** One attempt to start a verification. Throws a TwilioError on any failure. */
async function verifyStartOnce(to, lang, { env, fetchImpl }) {
  const service = env.TWILIO_VERIFY_SERVICE_SID;
  if (!service) throw new TwilioError("TWILIO_VERIFY_SERVICE_SID must be set.");
  let res, data;
  try {
    ({ res, data } = await postForm(fetchImpl, `https://verify.twilio.com/v2/Services/${service}/Verifications`, { Authorization: twilioAuth(env) }, {
      To: to,
      Channel: "sms",
      Locale: VERIFY_LOCALES.has(lang) ? lang : "en",
    }));
  } catch (error) {
    if (error instanceof TwilioError) throw error;
    throw new TwilioError(`Twilio Verify unreachable: ${error.message}`, { transient: true });
  }
  if (res.ok && data.sid) return String(data.sid);
  const code = Number(data.code) || null;
  // 5xx and Twilio's own request limit (20429) pass; 60203 (too many codes to
  // this number) is a 429 too, but waiting a second won't change it.
  const transient = res.status >= 500 || code === 20429;
  throw new TwilioError(`Twilio Verify refused to send (${res.status}${code ? ` / ${code}` : ""}): ${data.message ?? "no verification id"}`, { status: res.status, code, transient });
}

/**
 * Starts a verification; returns its SID. Twilio makes, sends and keeps the
 * code. A transient failure is tried once more after a short pause, so one
 * slow answer doesn't cost the person their code.
 */
export async function twilioVerifyStart(to, lang = "en", { env = process.env, fetchImpl = fetch, retryDelayMs = 700 } = {}) {
  try {
    return await verifyStartOnce(to, lang, { env, fetchImpl });
  } catch (error) {
    if (!(error instanceof TwilioError) || !error.transient) throw error;
    console.warn("[otp] Twilio Verify hiccup, trying once more:", error.message);
    await sleep(retryDelayMs);
    return verifyStartOnce(to, lang, { env, fetchImpl });
  }
}

/**
 * Checks a code against a verification. "approved" | "wrong" | "gone"
 * (expired, already used or too many tries: Twilio answers 404).
 * Throws when Twilio cannot be reached, so the caller does not count a try.
 */
export async function twilioVerifyCheck(verificationSid, code, { env = process.env, fetchImpl = fetch } = {}) {
  const { res, data } = await postForm(fetchImpl, `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, { Authorization: twilioAuth(env) }, {
    VerificationSid: verificationSid,
    Code: code,
  });
  if (res.status === 404) return "gone";
  if (!res.ok) throw new Error(`Twilio Verify check failed (${res.status}): ${data.message ?? ""}`);
  return data.status === "approved" ? "approved" : "wrong";
}

/* ── Plain SMS gateways ────────────────────────────────────────────────── */

/**
 * Africa's Talking (https://developers.africastalking.com/docs/sms). The
 * sender ID must be registered on the Nigerian transactional route so DND
 * numbers receive it. Username "sandbox" uses the sandbox host.
 */
async function africastalking(to, body, { env, fetchImpl }) {
  const username = env.AT_USERNAME, apiKey = env.AT_API_KEY;
  if (!username || !apiKey) throw new Error("AT_USERNAME and AT_API_KEY must be set.");
  const host = username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  const form = { username, to, message: body };
  if (env.AT_SENDER_ID) form.from = env.AT_SENDER_ID;
  const { res, data } = await postForm(fetchImpl, `${host}/version1/messaging`, { apiKey }, form);
  const r = data.SMSMessageData?.Recipients?.[0];
  // 100 Processed, 101 Sent, 102 Queued.
  if (!res.ok || !r || ![100, 101, 102].includes(Number(r.statusCode))) {
    throw new Error(`Africa's Talking rejected the message (${res.status}): ${r?.status ?? data.SMSMessageData?.Message ?? "no recipient"}`);
  }
  return String(r.messageId);
}

/** Twilio Programmable Messaging, from a Messaging Service (recommended) or a sender. */
async function twilio(to, body, { env, fetchImpl }) {
  const form = { To: to, Body: body };
  if (env.TWILIO_MESSAGING_SERVICE_SID) form.MessagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;
  else if (env.TWILIO_FROM) form.From = env.TWILIO_FROM;
  else throw new Error("TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM must be set.");
  const { res, data } = await postForm(fetchImpl, `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, { Authorization: twilioAuth(env) }, form);
  if (!res.ok || !data.sid) throw new Error(`Twilio rejected the message (${res.status}): ${data.message ?? "no message id"}`);
  return String(data.sid);
}

/**
 * Termii (https://developers.termii.com). The "dnd" channel is the
 * transactional route that reaches Do-Not-Disturb numbers.
 */
async function termii(to, body, { env, fetchImpl }) {
  const key = env.TERMII_API_KEY, from = env.TERMII_SENDER_ID;
  if (!key || !from) throw new Error("TERMII_API_KEY and TERMII_SENDER_ID must be set.");
  const base = (env.TERMII_BASE_URL ?? "https://v4.api.termii.com").replace(/\/+$/, "");
  const res = await fetchImpl(`${base}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, to: String(to).replace(/\D/g, ""), from, sms: body, type: "plain", channel: env.TERMII_CHANNEL ?? "dnd" }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.message_id) throw new Error(`Termii rejected the message (${res.status}): ${data.message ?? "no message id"}`);
  return String(data.message_id);
}

const GATEWAYS = { africastalking, twilio, termii };
export const SMS_GATEWAYS = ["console", ...Object.keys(GATEWAYS)];

/**
 * Sends one SMS, trying each SMS_PROVIDER in order until one accepts it.
 * Returns { provider, messageId }; throws only when every gateway failed.
 */
export async function sendSms(to, body, { env = process.env, fetchImpl = fetch } = {}) {
  const errors = [];
  for (const name of smsProviders(env)) {
    if (name === "console") return { provider: "console", messageId: "console" };
    const gateway = GATEWAYS[name];
    if (!gateway) { errors.push(`"${name}" is not a known SMS provider`); continue; }
    try {
      return { provider: name, messageId: await gateway(to, body, { env, fetchImpl }) };
    } catch (error) {
      errors.push(error.message);
      console.error(`[sms] ${name} failed, trying the next provider:`, error.message);
    }
  }
  throw new Error(errors.join(" | ") || "No SMS provider configured.");
}

/**
 * Validation and normalisation rules (spec §11). Pure functions with no
 * imports, so the browser and the server run exactly the same checks: a field
 * the form accepts is a field the API accepts.
 */

/* ── Phone numbers ─────────────────────────────────────────────────────── */

/**
 * Any common way of writing a Nigerian mobile number -> E.164, or null.
 * Accepts 08031234567, +2348031234567, 2348031234567, 8031234567,
 * with spaces, dashes or brackets anywhere.
 */
export function normalizePhone(input) {
  if (!input) return null;
  let digits = String(input).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("234")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  // Nigerian mobile numbers: 70x, 80x, 81x, 90x, 91x and 71x ranges.
  if (!/^[789][01]\d{8}$/.test(digits)) return null;
  return `+234${digits}`;
}

/** +2348031234567 -> 0803 123 4567 */
export function formatPhone(e164) {
  if (!e164) return "";
  const local = `0${e164.replace(/^\+234/, "")}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** +2348031234567 -> 0803 *** 4567 (for summary-only views) */
export function maskPhone(e164) {
  if (!e164) return "";
  const local = `0${e164.replace(/^\+234/, "")}`;
  return `${local.slice(0, 4)} *** ${local.slice(7)}`;
}

/* ── Names ─────────────────────────────────────────────────────────────── */

// Letters in any script (so ƙ, ɗ, ɓ, ƴ, ẹ, ọ, ṣ, ị, ụ, ṅ and tone marks all
// pass), combining marks, spaces, hyphens and apostrophes.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' ’-]*$/u;

export function cleanName(input) {
  return String(input ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidName(input) {
  const name = cleanName(input);
  return name.length >= 2 && name.length <= 50 && NAME_RE.test(name);
}

/** "aDEKUNLE o'neil-bello" -> "Adekunle O'Neil-Bello" */
export function properCase(input) {
  return cleanName(input)
    .toLocaleLowerCase("en-NG")
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase("en-NG"));
}

/* ── Dates ─────────────────────────────────────────────────────────────── */

/** Whole years between an ISO date of birth and a reference date. */
export function ageOn(dob, on = new Date()) {
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return -1;
  let age = on.getFullYear() - birth.getFullYear();
  const m = on.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function isFutureDate(iso, now = new Date()) {
  const d = new Date(`${iso.length === 7 ? `${iso}-01` : iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return true;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d > today;
}

export function isValidIsoDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) return false;
  // Parse as UTC so the round-trip through toISOString() can't shift the day.
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/* ── Email ─────────────────────────────────────────────────────────────── */

export function normalizeEmail(input) {
  const email = String(input ?? "").trim().toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/* ── URLs and social handles ───────────────────────────────────────────── */

/** Adds https:// when missing. Format check only, never a live check. */
export function normalizeUrl(input) {
  let url = String(input ?? "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export const SOCIAL_NETWORKS = {
  facebook: { label: "Facebook", hosts: ["facebook.com", "fb.com", "m.facebook.com"], base: "https://facebook.com/" },
  x: { label: "X (Twitter)", hosts: ["x.com", "twitter.com", "mobile.twitter.com"], base: "https://x.com/" },
  instagram: { label: "Instagram", hosts: ["instagram.com"], base: "https://instagram.com/" },
  tiktok: { label: "TikTok", hosts: ["tiktok.com"], base: "https://tiktok.com/@", at: true },
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be", "m.youtube.com"], base: "https://youtube.com/@", at: true, urlOnly: false },
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com"], base: "https://linkedin.com/in/" },
};

/**
 * Accepts `@name`, `name` or a full profile URL, and returns the clean handle
 * and the full URL separately (spec §5 step 5b). `ok: false` is a hint for
 * the "Looks right" tick only; the form never blocks on it.
 */
export function normalizeHandle(network, input) {
  const raw = String(input ?? "").trim();
  const spec = SOCIAL_NETWORKS[network];
  if (!raw || !spec) return { handle: "", url: "", ok: raw === "" };

  const looksLikeUrl = /^https?:\/\//i.test(raw) || spec.hosts.some((h) => raw.toLowerCase().startsWith(h) || raw.toLowerCase().startsWith(`www.${h}`));
  if (looksLikeUrl) {
    const url = normalizeUrl(raw);
    if (!url) return { handle: "", url: "", ok: false };
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (!spec.hosts.includes(host)) return { handle: "", url, ok: false };
    const parts = parsed.pathname.split("/").filter(Boolean);
    let handle = parts[0] ?? "";
    if (network === "linkedin" && ["in", "company"].includes(parts[0])) handle = parts[1] ?? "";
    if (network === "youtube" && ["c", "channel", "user"].includes(parts[0])) handle = parts[1] ?? "";
    handle = handle.replace(/^@/, "");
    return { handle, url, ok: Boolean(handle) };
  }

  const handle = raw.replace(/^@/, "");
  const ok = /^[A-Za-z0-9._-]{1,60}$/.test(handle);
  return { handle, url: ok ? `${spec.base}${handle}` : "", ok };
}

/* ── Group names and duplicate matching ────────────────────────────────── */

/** Lower-cased, accent-folded, with filler words removed. */
export function nameKey(input) {
  return cleanName(input)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|of|for|and|group|support|movement|association|forum)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s) {
  const out = new Map();
  const str = s.replace(/ /g, "");
  for (let i = 0; i < str.length - 1; i += 1) {
    const g = str.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice similarity between two names, 0..1. */
export function nameSimilarity(a, b) {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const A = bigrams(ka);
  const B = bigrams(kb);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of A) {
    overlap += Math.min(n, B.get(g) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

export const SIMILAR_NAME_THRESHOLD = 0.72;

/* ── Passwords ─────────────────────────────────────────────────────────── */

const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "iloveyou", "adc12345", "11111111", "00000000", "abcd1234", "password123"]);

/** At least 8 characters, not all digits, not a well-known password. Returns a message or null. */
export function passwordProblem(password) {
  const p = String(password ?? "");
  if (p.length < 8) return "Use at least 8 characters.";
  if (p.length > 128) return "Use at most 128 characters.";
  if (/^\d+$/.test(p)) return "Use some letters as well as numbers.";
  if (COMMON.has(p.toLowerCase())) return "That password is too easy to guess. Choose another.";
  return null;
}

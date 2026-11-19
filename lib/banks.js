import { BANKS } from "./banks-list.js";

export { BANKS };

/**
 * Nigerian banks and the volunteer's bank accounts.
 *
 * Shared by the registration form (search, instant checks) and the server
 * (the same checks again, then storage), so both always agree.
 *
 *   searchBanks(q)        ranked matches: "gtb", "uba", "first bank", "kuda",
 *                         "lapo mfb" and "lapo microfinance" all find the bank
 *   bankAccountProblems   one message per field, keyed "0.number" and so on
 *   cleanBankAccounts     the accounts as they are stored
 *
 * Account numbers are 10-digit NUBANs. Without each bank's CBN code the NUBAN
 * check digit cannot be computed, so the number is checked for shape here and
 * confirmed by the coordinator when they call.
 */

export const MAX_BANK_ACCOUNTS = 2;

/** Shown before anything is typed: the banks most volunteers use. */
export const POPULAR_BANKS = [
  "OPAY DIGITAL SERVICES LIMITED", "MONIEPOINT MICROFINANCE BANK", "PALMPAY", "ACCESS BANK", "GUARANTY TRUST BANK",
  "ZENITH BANK", "UNITED BANK FOR AFRICA", "FIRST BANK OF NIGERIA", "KUDA MICROFINANCE BANK", "FIDELITY BANK",
  "FCMB", "UNION BANK", "STERLING BANK", "WEMA BANK", "POLARIS BANK LTD", "STANBIC IBTC BANK", "ECOBANK", "KEYSTONE BANK",
];

/** Names people actually type, mapped to the listed bank. */
const ALIASES = {
  gtb: "GUARANTY TRUST BANK", gtbank: "GUARANTY TRUST BANK", gtco: "GUARANTY TRUST BANK",
  uba: "UNITED BANK FOR AFRICA", fbn: "FIRST BANK OF NIGERIA", firstbank: "FIRST BANK OF NIGERIA",
  opay: "OPAY DIGITAL SERVICES LIMITED", moniepoint: "MONIEPOINT MICROFINANCE BANK", kuda: "KUDA MICROFINANCE BANK",
  stanbic: "STANBIC IBTC BANK", ibtc: "STANBIC IBTC BANK", "palm pay": "PALMPAY", "eco bank": "ECOBANK",
  "standard chartered": "STANDARD CHARTERED BANK NIGERIA LTD", scb: "STANDARD CHARTERED BANK NIGERIA LTD",
  "first city monument bank": "FCMB", citibank: "CITI BANK", vbank: "VFD MFB", "v bank": "VFD MFB",
  "fair money": "FairMoney MFB", "9psb": "9PAYMENT SERVICE BANK", "9mobile": "9PAYMENT SERVICE BANK",
  "mtn momo": "Momo Payment Service Bank", "airtel smartcash": "SmartCash Payment Service Bank",
};

/**
 * One comparable form: lower case, no accents or punctuation, and the
 * misspellings and short forms in the list ("MFB", "MICORFINANCE") spelled
 * out, so "lapo microfinance" finds "LAPO MFB" and the other way round.
 */
export function bankKey(s) {
  const k = String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bmicro finance\b|\bmicorfinance\b|\bmicrofinace\b|\bmicrofinanace\b/g, "microfinance")
    .replace(/\bmortage\b/g, "mortgage")
    .replace(/\bmfb\b/g, "microfinance bank")
    .replace(/\bpsb\b/g, "payment service bank")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${k} `;
}

// `glued`: the name with spaces removed, from each word onwards, so "firstbank" finds FIRST BANK OF NIGERIA.
const INDEX = BANKS.map((name, order) => {
  const key = bankKey(name);
  const words = key.trim().split(" ");
  return { name, key, glued: words.map((_, i) => words.slice(i).join("")), popular: POPULAR_BANKS.indexOf(name), order };
});
const BY_KEY = new Map(INDEX.map((b) => [b.key, b.name]));
const ALIAS_KEYS = Object.entries(ALIASES).map(([a, name]) => [bankKey(a), name]);

/** The listed spelling of a bank typed in any case or form (or a nickname), or null. */
export function findBank(name) {
  const k = bankKey(name);
  if (!k.trim()) return null;
  return BY_KEY.get(k) ?? ALIAS_KEYS.find(([a]) => a === k)?.[1] ?? null;
}

/**
 * Banks matching what was typed, best first. Every word typed must start a
 * word in the bank's name ("fi ba" finds FIDELITY BANK); typing without spaces
 * ("firstbank") also works. Ranked: nickname, exact name, name starts with it,
 * then popular banks, then the list order. Nothing typed: the popular banks.
 */
export function searchBanks(query, limit = 50) {
  const q = bankKey(query);
  const words = q.trim().split(" ").filter(Boolean);
  if (!words.length) return POPULAR_BANKS.slice(0, limit);
  const typed = q.trim();
  const aliasHits = new Set(ALIAS_KEYS.filter(([a]) => a.trim().startsWith(typed)).map(([, n]) => n));
  const flatQ = words.join("");
  const scored = [];
  for (const b of INDEX) {
    const alias = aliasHits.has(b.name);
    const words_ = words.every((w) => b.key.includes(` ${w}`));
    const glued = !words_ && flatQ.length >= 4 && b.glued.some((g) => g.startsWith(flatQ));
    if (!alias && !words_ && !glued) continue;
    const score = (alias ? 0 : 1000)
      + (b.key === q ? 0 : b.key.startsWith(` ${typed}`) ? 100 : words_ ? 200 : 300)
      + (b.popular >= 0 ? b.popular : 50);
    scored.push({ name: b.name, score, order: b.order });
  }
  scored.sort((x, y) => x.score - y.score || x.order - y.order);
  return scored.slice(0, limit).map((s) => s.name);
}

/** How many banks match, for "Showing 50 of 212". */
export const countBanks = (query) => searchBanks(query, BANKS.length).length;

/** Digits only: the spaces and dashes people type are dropped. */
export const accountDigits = (v) => String(v ?? "").replace(/[\s-]/g, "");

/** "0123456789" → "012 345 6789", the way banks print it. */
export function formatAccountNumber(v) {
  const d = accountDigits(v);
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

/** "0123456789" → "•••• 6789", for anyone who should not see the whole number. */
export function maskAccountNumber(v) {
  const d = accountDigits(v);
  return d ? `•••• ${d.slice(-4)}` : "";
}

/** Tidy an account name: single spaces, upper case (as banks show it). */
export const cleanAccountName = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

// Letters in any script (Hausa, Yoruba and Igbo letters and tone marks too), spaces and . ' - &
const ACCOUNT_NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’&-]{1,98}[\p{L}\p{M}.]$/u;

const isBlank = (a) => !String(a?.bank ?? "").trim() && !accountDigits(a?.number) && !String(a?.name ?? "").trim();

/**
 * Problems with the accounts, one per field: { "0.bank": "...", "1.number": "..." }.
 * The first account is required (unless `required` is false); the second is
 * optional but, once started, must be complete and must not repeat the first.
 */
export function bankAccountProblems(accounts, { required = true } = {}) {
  const e = {};
  const list = Array.isArray(accounts) && accounts.length ? accounts : [{}];
  if (list.length > MAX_BANK_ACCOUNTS && list.slice(MAX_BANK_ACCOUNTS).some((a) => !isBlank(a))) e.list = "You can add up to two bank accounts.";
  const seen = new Set();
  list.slice(0, MAX_BANK_ACCOUNTS).forEach((a, i) => {
    if (isBlank(a) && (i > 0 || !required)) return;
    const bank = String(a?.bank ?? "").trim();
    if (!bank) e[`${i}.bank`] = "Choose your bank.";
    else if (a?.other ? bank.length < 3 || bank.length > 80 : !findBank(bank)) e[`${i}.bank`] = a?.other ? "Enter your bank's full name." : "Choose your bank from the list.";

    const digits = accountDigits(a?.number);
    if (!digits) e[`${i}.number`] = "Enter your 10-digit account number.";
    else if (!/^\d+$/.test(digits)) e[`${i}.number`] = "Use numbers only.";
    else if (digits.length !== 10) e[`${i}.number`] = digits.length < 10 ? "An account number has 10 digits. Check for a missing digit." : "An account number has 10 digits. Check for an extra digit.";
    else if (/^(\d)\1{9}$/.test(digits) || digits === "0123456789" || digits === "1234567890") e[`${i}.number`] = "Check the account number. It doesn't look like a real one.";

    const name = String(a?.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) e[`${i}.name`] = "Enter the name on the account.";
    else if (!ACCOUNT_NAME.test(name) || name.split(" ").length < 2) e[`${i}.name`] = "Enter the account name as your bank shows it: at least two names, letters only.";

    if (bank && digits.length === 10 && !e[`${i}.number`]) {
      const k = `${bankKey(findBank(bank) ?? bank)}|${digits}`;
      if (seen.has(k)) e[`${i}.number`] = "This is the same as your first account. Add a different account, or remove this one.";
      seen.add(k);
    }
  });
  return e;
}

/** The accounts as stored: complete ones only, tidied, in the bank's listed spelling. */
export function cleanBankAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : []).slice(0, MAX_BANK_ACCOUNTS)
    .filter((a) => !isBlank(a))
    .map((a) => ({
      bank: a.other ? String(a.bank).trim().replace(/\s+/g, " ") : findBank(a.bank),
      listed: !a.other,
      number: accountDigits(a.number),
      name: cleanAccountName(a.name),
    }));
}

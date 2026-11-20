"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, Check, CheckCircle2, ChevronDown, Lock, Plus, Search, X } from "lucide-react";

import { cx } from "@/components/ui";
import {
  BANKS, MAX_BANK_ACCOUNTS, searchBanks, countBanks, bankKey, accountDigits, formatAccountNumber,
  bankAccountProblems, cleanAccountName,
} from "@/lib/banks";

/**
 * The volunteer's bank account: one, required.
 *
 * Each account is a searchable bank picker, the 10-digit account number and
 * the name on the account. Field messages appear once a field is left, or
 * for every field when the person presses Continue (`showErrors`).
 *
 * Value: [{ bank, other?, number, name }]
 */
export default function BankAccounts({ value, onChange, t, showErrors, ownerName = "" }) {
  const accounts = Array.isArray(value) && value.length ? value : [{}];
  const problems = bankAccountProblems(accounts);
  const [touched, setTouched] = useState({});
  // Once Continue has been pressed, keep showing what's still wrong while it's fixed.
  const [tried, setTried] = useState(false);
  useEffect(() => { if (showErrors) setTried(true); }, [showErrors]);

  const update = (i, patch) => onChange(accounts.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const touch = (key) => setTouched((s) => (s[key] ? s : { ...s, [key]: true }));
  const errorFor = (key) => (tried || showErrors || touched[key] ? problems[key] : null);

  return (
    <div className="space-y-4">
      {accounts.slice(0, MAX_BANK_ACCOUNTS).map((a, i) => (
        <section
          key={i}
          aria-labelledby={`bank-acct-${i}`}
          className="rounded-2xl border border-line bg-white p-4 sm:p-5"
        >
          <h3 id={`bank-acct-${i}`} className="sr-only">{t("Bank account")}</h3>
          <div className="grid gap-5">
            <BankPicker
              idBase={`bank-${i}`}
              account={a}
              t={t}
              error={errorFor(`${i}.bank`)}
              onPick={(bank, other = false) => { update(i, { bank, other }); touch(`${i}.bank`); }}
              onClear={() => update(i, { bank: "", other: false })}
            />
            <AccountNumber
              id={`bank-${i}-number`}
              value={a.number}
              t={t}
              error={errorFor(`${i}.number`)}
              onChange={(number) => update(i, { number })}
              onBlur={() => touch(`${i}.number`)}
            />
            <AccountName
              id={`bank-${i}-name`}
              value={a.name}
              t={t}
              ownerName={ownerName}
              error={errorFor(`${i}.name`)}
              onChange={(name) => update(i, { name })}
              onBlur={() => touch(`${i}.name`)}
            />
          </div>

          <Summary account={a} complete={!problems[`${i}.bank`] && !problems[`${i}.number`] && !problems[`${i}.name`]} t={t} />
        </section>
      ))}

      <p className="flex items-start gap-2 text-[13px] leading-5 text-ink-muted">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t("Your account number is stored encrypted. Coordinators see only the last four digits; only authorised administrators can see the full number.")}
      </p>
    </div>
  );
}

/* ── Bank picker: type to search, arrow keys and Enter to choose ─────────── */

function BankPicker({ idBase, account, t, error, onPick, onClear }) {
  const listId = `${idBase}-list`;
  const inputId = `${idBase}-search`;
  const hintId = `${idBase}-hint`;
  const errorId = `${idBase}-error`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState(!account.bank);
  const input = useRef(null);
  const list = useRef(null);
  const uid = useId();

  const results = useMemo(() => searchBanks(query, 60), [query]);
  const total = useMemo(() => (query.trim() ? countBanks(query) : results.length), [query, results.length]);
  const typed = query.trim();
  const offerOther = typed.length >= 3 && !results.some((r) => bankKey(r) === bankKey(typed));

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { if (!account.bank) setEditing(true); }, [account.bank]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const optionCount = results.length + (offerOther ? 1 : 0);

  function choose(index) {
    if (index < results.length) onPick(results[index], false);
    else if (offerOther) onPick(typed.replace(/\s+/g, " "), true);
    else return;
    setOpen(false);
    setQuery("");
    setEditing(false);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(optionCount - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home" && open) { e.preventDefault(); setActive(0); }
    else if (e.key === "End" && open) { e.preventDefault(); setActive(Math.max(0, optionCount - 1)); }
    else if (e.key === "Enter") {
      // Enter chooses the highlighted bank rather than submitting the form.
      if (open && optionCount) { e.preventDefault(); choose(active); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false); }
      else if (account.bank) { e.preventDefault(); setEditing(false); setQuery(""); }
    }
  }

  function change() {
    setEditing(true);
    setQuery("");
    setOpen(true);
    requestAnimationFrame(() => input.current?.focus());
  }

  const label = (
    <label htmlFor={editing ? inputId : `${idBase}-chosen`} id={`${idBase}-label`} className="block text-[15px] font-semibold">
      {t("Bank")}
    </label>
  );

  if (!editing && account.bank) {
    return (
      <div className="min-w-0 space-y-2">
        {label}
        <button
          id={`${idBase}-chosen`}
          type="button"
          onClick={change}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? "true" : undefined}
          className={cx(
            "flex min-h-13 w-full items-center gap-3 rounded-xl border bg-white px-3 py-2 text-left transition-colors hover:border-ink/40",
            error ? "border-danger" : "border-brand-700 ring-1 ring-brand-700/30",
          )}
        >
          <BankMark name={account.bank} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold">{account.bank}</span>
            {account.other && <span className="block text-[12px] text-ink-muted">{t("Not on our list. Your coordinator will confirm it.")}</span>}
          </span>
          <span className="shrink-0 text-[14px] font-semibold text-brand-700">{t("Change")}</span>
        </button>
        {error && <FieldError id={errorId}>{t(error)}</FieldError>}
      </div>
    );
  }

  const activeId = open && optionCount ? `${uid}-opt-${active}` : undefined;

  return (
    <div className="min-w-0 space-y-2">
      {label}
      <p id={hintId} className="-mt-1 text-[14px] text-ink-muted">{t("Type the first letters or a short name, e.g. GTB, UBA, OPay, Moniepoint.")}</p>
      <div
        className="relative"
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); if (account.bank) { setEditing(false); setQuery(""); } } }}
      >
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
        <input
          ref={input}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-describedby={[hintId, error && errorId].filter(Boolean).join(" ")}
          aria-invalid={error ? "true" : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={80}
          placeholder={t("Search {n} banks", { n: BANKS.length })}
          className="input !min-h-13 !rounded-xl !pl-11 !pr-11 !text-[17px]"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button type="button" aria-label={t("Clear search")} className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:bg-surface-alt"
            onClick={() => { setQuery(""); input.current?.focus(); }}>
            <X aria-hidden className="size-4" />
          </button>
        ) : (
          <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
        )}

        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-white shadow-[0_18px_40px_-18px_rgb(6_63_32/0.45)]">
            <p className="border-b border-line bg-surface-alt/60 px-3.5 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted" aria-hidden>
              {typed ? (total === 0 ? t("No matches") : total === 1 ? t("1 bank") : t("{n} banks", { n: total })) : t("Popular banks")}
            </p>
            <ul ref={list} id={listId} role="listbox" aria-label={t("Banks")} className="max-h-[min(18rem,45vh)] overflow-y-auto overscroll-contain py-1">
              {results.map((name, i) => (
                <li
                  key={name}
                  id={`${uid}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => choose(i)}
                  className={cx("flex cursor-pointer items-center gap-3 px-3 py-2.5", i === active && "bg-brand-50")}
                >
                  <BankMark name={name} small />
                  <span className="min-w-0 flex-1 text-[15px] leading-snug"><Highlight text={name} query={typed} /></span>
                  {account.bank === name && <Check aria-hidden className="size-4 shrink-0 text-brand-700" strokeWidth={3} />}
                </li>
              ))}
              {offerOther && (
                <li
                  id={`${uid}-opt-${results.length}`}
                  data-index={results.length}
                  role="option"
                  aria-selected={active === results.length}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActive(results.length)}
                  onClick={() => choose(results.length)}
                  className={cx("flex cursor-pointer items-center gap-3 border-t border-line px-3 py-3", active === results.length && "bg-brand-50")}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-alt text-ink-muted" aria-hidden><Building2 className="size-4" /></span>
                  <span className="min-w-0 flex-1 text-[14px] leading-snug">
                    <span className="block font-semibold">{t("My bank isn't listed")}</span>
                    <span className="block text-ink-muted">{t("Use “{name}”", { name: typed })}</span>
                  </span>
                </li>
              )}
            </ul>
            {total > results.length && (
              <p className="border-t border-line px-3.5 py-2 text-[12px] text-ink-muted" aria-hidden>
                {t("Showing {n} of {total}. Keep typing to narrow the list.", { n: results.length, total })}
              </p>
            )}
            {typed && total === 0 && !offerOther && (
              <p className="px-3.5 py-3 text-[14px] text-ink-muted">{t("Keep typing your bank's name.")}</p>
            )}
          </div>
        )}
        {/* What a screen reader hears as the list changes. */}
        <p className="sr-only" aria-live="polite">
          {open && typed ? (total === 0 ? t("No banks match. You can use the name you typed.") : t("{n} banks found. Use the arrow keys to choose.", { n: total })) : ""}
        </p>
      </div>
      {error && <FieldError id={errorId}>{t(error)}</FieldError>}
    </div>
  );
}

/** Bold the part of the bank's name that matches each typed word. */
function Highlight({ text, query }) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return text;
  const parts = [];
  let rest = text;
  let key = 0;
  // Mark the start of each word in the name that a typed word begins.
  const re = new RegExp(`(^|[^a-z0-9])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|")})`, "i");
  while (rest) {
    const m = re.exec(rest);
    if (!m) { parts.push(rest); break; }
    const start = m.index + m[1].length;
    parts.push(rest.slice(0, start));
    parts.push(<mark key={key++} className="rounded-sm bg-transparent font-bold text-brand-800">{rest.slice(start, start + m[2].length)}</mark>);
    rest = rest.slice(start + m[2].length);
  }
  return parts;
}

const MARK_COLORS = ["bg-brand-700", "bg-[#1f5fa8]", "bg-[#8a3ea3]", "bg-[#b4570d]", "bg-[#0f766e]", "bg-[#a3243b]", "bg-[#4f5b14]", "bg-[#3d4a5c]"];

/** A small coloured badge with the bank's initials, so a chosen bank is easy to recognise. */
function BankMark({ name, small }) {
  const words = String(name).replace(/\b(microfinance|bank|mfb|limited|ltd|plc|nigeria|of|the|and)\b/gi, " ").trim().split(/[\s_-]+/).filter(Boolean);
  const initials = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-lg font-bold text-white", MARK_COLORS[h % MARK_COLORS.length], small ? "size-8 text-[12px]" : "size-10 text-[14px]")}>
      {initials}
    </span>
  );
}

/* ── Account number and name ───────────────────────────────────────────── */

function AccountNumber({ id, value, t, error, onChange, onBlur }) {
  const digits = accountDigits(value).replace(/\D/g, "");
  const full = digits.length === 10;
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-[15px] font-semibold">{t("Account number")}</label>
      <p id={`${id}-hint`} className="-mt-1 text-[14px] text-ink-muted">{t("The 10-digit NUBAN number. For OPay, PalmPay and similar it is usually your phone number without the first 0.")}</p>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={10}
          placeholder="0123456789"
          aria-describedby={[`${id}-hint`, `${id}-count`, error && `${id}-error`].filter(Boolean).join(" ")}
          aria-invalid={error ? "true" : undefined}
          className="input !min-h-13 !rounded-xl !pr-24 font-mono !text-[19px] tracking-[0.18em]"
          value={digits}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          onPaste={(e) => {
            // Pasting "012 345 6789" or "0123-456-789" keeps just the digits.
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
            if (pasted) { e.preventDefault(); onChange(pasted.slice(0, 10)); }
          }}
          onBlur={onBlur}
        />
        <span
          id={`${id}-count`}
          className={cx("pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
            full ? "bg-success-bg text-success" : "bg-surface-alt text-ink-muted")}
        >
          {full && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
          <span className="sr-only">{t("Digits entered:")} </span>{digits.length}/10
        </span>
      </div>
      {error && <FieldError id={`${id}-error`}>{t(error)}</FieldError>}
    </div>
  );
}

function AccountName({ id, value, t, ownerName, error, onChange, onBlur }) {
  const suggestion = cleanAccountName(ownerName);
  const showSuggestion = suggestion.split(" ").length >= 2 && !String(value ?? "").trim();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-[15px] font-semibold">{t("Account name")}</label>
      <p id={`${id}-hint`} className="-mt-1 text-[14px] text-ink-muted">{t("Exactly as your bank shows it. Payments can fail if the name doesn't match.")}</p>
      <input
        id={id}
        type="text"
        autoComplete="name"
        autoCapitalize="characters"
        maxLength={100}
        aria-describedby={[`${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ")}
        aria-invalid={error ? "true" : undefined}
        className="input !min-h-13 !rounded-xl !text-[17px] uppercase placeholder:normal-case"
        placeholder={t("e.g. ADEBAYO JOHN OKAFOR")}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {showSuggestion && (
        <button type="button" onClick={() => onChange(suggestion)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-[14px] font-medium hover:border-brand-600 hover:bg-brand-50">
          <Plus aria-hidden className="size-4 text-brand-700" /> {t("Use my name:")} <strong className="font-semibold">{suggestion}</strong>
        </button>
      )}
      {error && <FieldError id={`${id}-error`}>{t(error)}</FieldError>}
    </div>
  );
}

/** Read-back of a complete account, so a wrong digit or bank is easy to spot. */
function Summary({ account, complete, t }) {
  if (!complete) return null;
  return (
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-success/25 bg-success-bg px-4 py-3" role="status">
      <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
      <div className="min-w-0 text-[14px] leading-5">
        <p className="font-semibold">{t("Please check this is right:")}</p>
        <p className="mt-0.5 break-words">
          <span className="font-semibold">{cleanAccountName(account.name)}</span>
          <span className="text-ink-muted"> · </span>
          <span className="font-mono font-semibold tracking-wide">{formatAccountNumber(account.number)}</span>
          <span className="text-ink-muted"> · </span>
          {account.bank}
        </p>
      </div>
    </div>
  );
}

function FieldError({ id, children }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-[14px] font-medium text-danger">
      <X aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

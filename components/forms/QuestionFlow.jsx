"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";

import { Card, cx } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { api, getIn, setIn } from "./api";

/**
 * Short screens of about three related questions each.
 *
 * One question per screen made the forms feel long; one long page made them
 * feel heavy. A handful of short screens ("About you", "Where you vote") is
 * the balance: few taps, little scrolling, always obvious what's left. Every
 * screen is checked before moving on, progress is saved on the device, and a
 * problem found on submit takes the person back to the screen that owns it.
 *
 * Screen:  { id, title, help?, when?(data), items: [Item], server?: step }
 * Item:    { path, label, kind, optional?, when?(data), validate?(value, data),
 *            options? | load?(data) + depends?(data), hint?, placeholder?, render?(ctx) }
 * Kinds:   text tel email password choice multi cards select date month check custom
 */
export default function QuestionFlow({ flow, screens, initial, onSubmit, submitLabel }) {
  const t = useT();
  const key = `adc_flow_${flow}`;
  const [data, setData] = useState(initial);
  const [id, setId] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const top = useRef(null);

  const visible = screens.filter((s) => !s.when || s.when(data));
  const index = Math.max(0, id ? visible.findIndex((s) => s.id === id) : 0);
  const screen = visible[index];
  const items = screen.items.filter((i) => !i.when || i.when(data));
  const last = index === visible.length - 1;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved?.data && saved.id && saved.id !== screens[0].id) setDraft(saved);
    } catch {}
  }, [key, screens]);

  useEffect(() => {
    if (!id) return;
    try { localStorage.setItem(key, JSON.stringify({ data, id, at: Date.now() })); } catch {}
  }, [key, data, id]);

  function set(path, value, item) {
    setErrors((e) => (e[path] ? { ...e, [path]: undefined } : e));
    setFormError(null);
    setData((d) => {
      const next = setIn(d, path, value);
      return item?.onSet ? item.onSet(value, next) ?? next : next;
    });
  }

  function go(targetId) {
    setErrors({});
    setFormError(null);
    setId(targetId);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  const owns = (i, k) => i.path && (k === i.path || k.startsWith(`${i.path}.`) || (i.errorPaths ?? []).some((p) => k === p || k.startsWith(`${p}.`)));

  async function next() {
    const e = {};
    for (const item of items) {
      const v = item.path ? getIn(data, item.path) : undefined;
      const problem = item.validate ? item.validate(v, data) : !item.optional && item.kind !== "check" && isEmpty(v) ? "Please answer this question." : null;
      if (problem) e[item.path ?? item.id] = t(problem);
    }
    if (Object.keys(e).length) return setErrors(e);

    if (screen.server) {
      setBusy(true);
      const r = await api(`/validate/${flow}`, { method: "POST", body: { step: screen.server, data } });
      setBusy(false);
      const mine = {};
      for (const [k, msg] of Object.entries(r.data?.errors ?? {})) {
        const owner = items.find((i) => owns(i, k));
        if (owner) mine[owner.path] = t(msg);
      }
      if (Object.keys(mine).length) return setErrors(mine);
    }

    if (!last) return go(visible[index + 1].id);

    setBusy(true);
    const r = await onSubmit(data);
    setBusy(false);
    if (r?.ok) {
      try { localStorage.removeItem(key); } catch {}
      return;
    }
    // Take them to the screen that owns the first problem.
    for (const [k, msg] of Object.entries(r?.errors ?? {})) {
      const target = visible.find((s) => s.items.some((i) => owns(i, k)));
      if (target) {
        const owner = target.items.find((i) => owns(i, k));
        go(target.id);
        return setTimeout(() => setErrors({ [owner.path]: t(msg) }), 60);
      }
    }
    setFormError(t(r?.error ?? "Something went wrong. Try again."));
  }

  const ctx = { data, set, t, go, visible };

  return (
    <div ref={top} className="mx-auto max-w-2xl scroll-mt-24">
      {draft && index === 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
          <p className="text-[15px]">{t("You have a registration in progress")}. {t("Pick up where you stopped, or start again.")}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setData((d) => ({ ...d, ...draft.data })); setDraft(null); go(draft.id); }}>{t("Continue where I stopped")}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { try { localStorage.removeItem(key); } catch {} setDraft(null); }}>{t("Start again")}</button>
          </div>
        </div>
      )}

      {/* Steps as a row of short bars: you can see how few there are. */}
      <div className="mb-4 flex items-center gap-4">
        <ol className="flex flex-1 gap-1.5" aria-label={t("Progress")}>
          {visible.map((s, i) => (
            <li key={s.id} className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= index ? "bg-brand-600" : "bg-ink/10")} aria-current={i === index ? "step" : undefined}>
              <span className="sr-only">{typeof s.title === "function" ? "" : t(s.title)}</span>
            </li>
          ))}
        </ol>
        <span className="num shrink-0 text-[13px] font-medium text-ink-muted">{t("Step {n} of {total}", { n: index + 1, total: visible.length })}</span>
      </div>

      <Card className="rounded-3xl p-6 sm:p-9">
        <form key={screen.id} className="animate-fade-up" noValidate onSubmit={(e) => { e.preventDefault(); next(); }}>
          <h2 className="text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-balance sm:text-[1.875rem]">
            {typeof screen.title === "function" ? screen.title(data, t) : t(screen.title)}
          </h2>
          {screen.help && <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{t(screen.help)}</p>}

          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            {items.map((item, i) => (
              <Item key={item.path ?? item.id} item={item} ctx={ctx} error={errors[item.path ?? item.id]} first={i === 0} />
            ))}
          </div>

          {formError && (
            <p role="alert" className="mt-5 flex items-start gap-2 text-[15px] font-medium text-danger">
              <X aria-hidden className="mt-0.5 size-4 shrink-0" />
              {formError}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
            {index > 0 ? (
              <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-ink-muted hover:text-ink" onClick={() => go(visible[index - 1].id)}>
                <ArrowLeft aria-hidden className="size-4" /> {t("Back")}
              </button>
            ) : <span />}
            <button type="submit" className="btn btn-primary btn-lg min-w-40" disabled={busy}>
              {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
              {last ? submitLabel : t("Continue")}
              {!busy && <ArrowRight aria-hidden className="size-5" />}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ── One question on a screen ─────────────────────────────────────────── */

function Item({ item, ctx, error, first }) {
  const { data, set, t } = ctx;
  const id = `f-${(item.path ?? item.id).replace(/\W/g, "-")}`;
  const value = item.path ? getIn(data, item.path) : undefined;
  const wide = item.wide ?? !["text", "tel", "email", "password", "select"].includes(item.kind);
  const control = (() => {
    switch (item.kind) {
      case "choice":
      case "multi":
        return <Chips item={item} value={value} onChange={(v) => set(item.path, v, item)} t={t} data={data} />;
      case "cards":
        return <Cards item={item} value={value} onChange={(v) => set(item.path, v, item)} t={t} />;
      case "select":
        return <SelectAnswer id={id} item={item} value={value} onChange={(v) => set(item.path, v, item)} t={t} data={data} error={error} />;
      case "date":
      case "month":
        return <DateAnswer item={item} value={value} onChange={(v) => set(item.path, v, item)} t={t} month={item.kind === "month"} />;
      case "check":
        return (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white p-4 text-[16px] leading-snug hover:bg-surface-alt">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-700" checked={Boolean(value)} onChange={(e) => set(item.path, e.target.checked, item)} />
            <span>{typeof item.label === "function" ? item.label(t) : t(item.label)}</span>
          </label>
        );
      case "custom":
        return item.render(ctx);
      default:
        return (
          <input
            id={id}
            className="input !min-h-13 !rounded-xl !text-[17px]"
            type={item.kind === "tel" ? "tel" : item.kind === "email" ? "email" : item.kind === "password" ? "password" : "text"}
            inputMode={item.kind === "tel" ? "tel" : item.kind === "email" ? "email" : undefined}
            autoComplete={item.autoComplete}
            placeholder={item.placeholder}
            maxLength={item.maxLength ?? 120}
            value={value ?? ""}
            onChange={(e) => set(item.path, e.target.value, item)}
            aria-invalid={error ? "true" : undefined}
            autoFocus={first}
          />
        );
    }
  })();
  if (item.kind === "check" || item.kind === "custom") {
    return (
      <div className="sm:col-span-2">
        {control}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    );
  }
  return (
    <div className={cx("min-w-0 space-y-2", wide && "sm:col-span-2")}>
      <label htmlFor={["choice", "multi", "cards", "date", "month"].includes(item.kind) ? undefined : id} className="block text-[15px] font-semibold">
        {typeof item.label === "function" ? item.label(data, t) : t(item.label)}
        {item.optional && <span className="ml-1.5 text-[13px] font-normal text-ink-muted">({t("optional")})</span>}
      </label>
      {item.hint && <p className="-mt-1 text-[14px] text-ink-muted">{t(item.hint)}</p>}
      {control}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ children }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-[14px] font-medium text-danger">
      <X aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

/** Pill chips: one tap to choose (or several, for "multi"). */
function Chips({ item, value, onChange, t, data }) {
  const options = typeof item.options === "function" ? item.options(data) : item.options;
  const multi = item.kind === "multi";
  const picked = new Set(multi ? value ?? [] : [value]);
  return (
    <div role={multi ? "group" : "radiogroup"} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = picked.has(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            role={multi ? undefined : "radio"}
            aria-checked={multi ? undefined : on}
            aria-pressed={multi ? on : undefined}
            onClick={() => onChange(multi ? (on ? [...picked].filter((x) => x !== o.value) : [...picked, o.value]) : o.value)}
            className={cx(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition-colors",
              on ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white text-ink hover:border-ink/40",
            )}
          >
            {on && <Check aria-hidden className="size-4" strokeWidth={3} />}
            {t(o.label)}
          </button>
        );
      })}
    </div>
  );
}

/** Larger tick cards with a one-line description (used for the volunteer roles). */
function Cards({ item, value, onChange, t }) {
  const picked = new Set(value ?? []);
  return (
    <div role="group" className="grid gap-2.5 sm:grid-cols-2">
      {item.options.map((o) => {
        const on = picked.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? [...picked].filter((x) => x !== o.value) : [...picked, o.value])}
            className={cx(
              "flex items-start gap-3 rounded-2xl border bg-white p-3.5 text-left transition-colors",
              on ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-line hover:border-ink/40",
            )}
          >
            <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md", on ? "bg-brand-700 text-white" : "border border-ink/30")} aria-hidden>
              {on && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-snug">{t(o.label)}</span>
              {o.hint && <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{t(o.hint)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Dropdown; options can load from the server and reload when what they depend on changes. */
function SelectAnswer({ id, item, value, onChange, t, data, error }) {
  const dep = item.depends?.(data);
  const [options, setOptions] = useState(item.load ? null : typeof item.options === "function" ? item.options(data) : item.options);
  useEffect(() => {
    if (!item.load) return;
    let live = true;
    if (item.depends && !dep) {
      setOptions([]);
      return;
    }
    setOptions(null);
    Promise.resolve(item.load(data)).then((o) => live && setOptions(o)).catch(() => live && setOptions([]));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  const waiting = item.depends && !dep;
  return (
    <select
      id={id}
      className="input !min-h-13 !rounded-xl !text-[17px] disabled:cursor-not-allowed disabled:opacity-60"
      value={value ?? ""}
      disabled={waiting || options === null}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error ? "true" : undefined}
    >
      <option value="">{waiting ? t(item.waitingText ?? "Choose the one above first") : options === null ? t("Loading…") : t(item.placeholder ?? "Choose…")}</option>
      {(options ?? []).map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
    </select>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Day / month / year boxes: quicker than a calendar on a cheap phone. Keeps partial picks so nothing resets. */
function DateAnswer({ item, value, onChange, t, month }) {
  const [y, m, d] = String(value ?? "").split("-");
  const now = new Date().getFullYear();
  const years = Array.from({ length: item.years ?? 100 }, (_, i) => String(now - (item.minAge ?? 0) - i));
  const write = (ny, nm, nd) => onChange(month ? `${ny ?? ""}-${nm ?? ""}` : `${ny ?? ""}-${nm ?? ""}-${nd ?? ""}`);
  const sel = "input !min-h-13 !rounded-xl !text-[17px]";
  return (
    <div className={cx("grid gap-2.5", month ? "grid-cols-2" : "grid-cols-[1fr_1.6fr_1.2fr]")}>
      {!month && (
        <select className={sel} aria-label={t("Day")} value={d ?? ""} onChange={(e) => write(y, m, e.target.value)}>
          <option value="">{t("Day")}</option>
          {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((x) => <option key={x} value={x}>{Number(x)}</option>)}
        </select>
      )}
      <select className={sel} aria-label={t("Month")} value={m ?? ""} onChange={(e) => write(y, e.target.value, d)}>
        <option value="">{t("Month")}</option>
        {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, "0")}>{t(name)}</option>)}
      </select>
      <select className={sel} aria-label={t("Year")} value={y ?? ""} onChange={(e) => write(e.target.value, m, d)}>
        <option value="">{t("Year")}</option>
        {years.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

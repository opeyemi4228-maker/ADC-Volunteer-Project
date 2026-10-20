"use client";

import { useCallback, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Field, cx } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { getIn, setIn } from "./api";

/**
 * Form state for the multi-step flows: one nested object, errors keyed by the
 * same dotted paths the server uses ("about.name", "leaders.0.phone"), so a
 * 422 from the API lands on the right field without any mapping.
 */
export function useForm(initial = {}) {
  const [data, setData] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = useCallback((path, value) => {
    setData((d) => setIn(d, path, value));
    setErrors((e) => {
      if (!e[path]) return e;
      const { [path]: _, ...rest } = e;
      return rest;
    });
  }, []);
  return { data, setData, errors, setErrors, set, get: (path) => getIn(data, path) };
}

const idOf = (path) => `f-${path.replace(/\./g, "-")}`;

export function TextField({ form, path, label, hint, optional, type = "text", className, inputClass, ...rest }) {
  const t = useT();
  return (
    <Field id={idOf(path)} label={label} hint={hint} optional={optional} optionalText={t("Optional")} error={t(form.errors[path] ?? "") || undefined} className={className}>
      {(aria) => {
        const Tag = type === "textarea" ? "textarea" : "input";
        return (
          <Tag
            {...aria}
            type={type === "textarea" ? undefined : type}
            className={cx("input", inputClass)}
            value={form.get(path) ?? ""}
            onChange={(e) => form.set(path, e.target.value)}
            {...rest}
          />
        );
      }}
    </Field>
  );
}

export function SelectField({ form, path, label, hint, optional, options, placeholder, className, onChange, disabled }) {
  const t = useT();
  return (
    <Field id={idOf(path)} label={label} hint={hint} optional={optional} optionalText={t("Optional")} error={t(form.errors[path] ?? "") || undefined} className={className}>
      {(aria) => (
        <select
          {...aria}
          className="input"
          value={form.get(path) ?? ""}
          disabled={disabled}
          onChange={(e) => (onChange ? onChange(e.target.value) : form.set(path, e.target.value))}
        >
          <option value="">{placeholder ?? t("Choose…")}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Pill buttons for short option lists; `multiple` stores an array. */
export function ChoiceChips({ form, path, label, hint, options, multiple = false, className }) {
  const t = useT();
  const value = form.get(path);
  const selected = (v) => (multiple ? (value ?? []).includes(v) : value === v);
  const toggle = (v) => {
    if (!multiple) return form.set(path, v);
    const cur = value ?? [];
    form.set(path, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  const error = form.errors[path];
  return (
    <fieldset className={cx("space-y-2", className)}>
      {label && <legend className="t-label">{label}</legend>}
      {hint && <p className="t-help">{hint}</p>}
      <div className="flex flex-wrap gap-2 pt-1" role={multiple ? "group" : "radiogroup"}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={selected(o.value)}
            title={o.hint ? t(o.hint) : undefined}
            onClick={() => toggle(o.value)}
          >
            {selected(o.value) && <Check aria-hidden className="size-4" />}
            {t(o.label)}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-[14px] font-medium text-danger" role="alert">
          {t(error)}
        </p>
      )}
    </fieldset>
  );
}

export function CheckField({ form, path, children }) {
  const t = useT();
  const error = form.errors[path];
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 hover:bg-surface-alt">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-brand-700"
          checked={Boolean(form.get(path))}
          onChange={(e) => form.set(path, e.target.checked)}
          aria-invalid={error ? "true" : undefined}
        />
        <span className="text-[15px]">{children}</span>
      </label>
      {error && (
        <p className="mt-1.5 text-[14px] font-medium text-danger" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}

/** "Step 3 of 7" and the step name, over one thin segment per step. */
export function Stepper({ steps, current }) {
  const t = useT();
  return (
    <div>
      <p className="text-[14px] text-ink-muted">{t("Step {n} of {total}", { n: current, total: steps.length })}</p>
      <p className="mt-0.5 text-[20px] font-bold tracking-tight">{t(steps[current - 1])}</p>
      <ol className="mt-3 flex gap-1.5" aria-hidden>
        {steps.map((s, i) => (
          <li
            key={s}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors",
              i + 1 <= current ? "bg-brand-700" : "bg-line",
            )}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * Desktop step list: every step visible at once (done ✓ / current / to do),
 * so people can see how much is left, the strongest cue for finishing a form.
 * Done steps are buttons back to that step; later steps can't be skipped to.
 */
export function StepRail({ steps, current, onGo, footer }) {
  const t = useT();
  return (
    <nav aria-label={t("Progress")} className="sticky top-28">
      <ol className="space-y-1">
        {steps.map((s, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "current" : "todo";
          const inner = (
            <>
              <span
                className={cx(
                  "num grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold transition-colors",
                  state === "done" && "bg-brand-700 text-white",
                  state === "current" && "bg-ink text-white",
                  state === "todo" && "bg-white text-ink-muted ring-1 ring-line",
                )}
              >
                {state === "done" ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : n}
              </span>
              <span className={cx("text-[15px]", state === "current" ? "font-semibold text-ink" : state === "done" ? "text-ink" : "text-ink-muted")}>{t(s)}</span>
            </>
          );
          return (
            <li key={s}>
              {state === "done" && onGo && n > 1 ? (
                <button type="button" onClick={() => onGo(n)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-ink/4">
                  {inner}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-2 py-2" aria-current={state === "current" ? "step" : undefined}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {footer && <div className="mt-8 border-t border-line pt-6 text-[14px] leading-relaxed text-ink-muted">{footer}</div>}
    </nav>
  );
}

export function StepNav({ onBack, onNext, nextLabel, busy, saved }) {
  const t = useT();
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
      {onBack && (
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
          <ChevronLeft aria-hidden className="size-5" />
          {t("Back")}
        </button>
      )}
      {saved && <span className="text-[13px] text-ink-muted">{t("Progress saved")}</span>}
      <button type="button" className="btn btn-primary ml-auto" onClick={onNext} disabled={busy}>
        {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
        {nextLabel ?? t("Continue")}
        {!busy && !nextLabel && <ChevronRight aria-hidden className="size-5" />}
      </button>
    </div>
  );
}

/** Moves focus to the first field with an error after a failed step. */
export function focusFirstError(errors) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  requestAnimationFrame(() => {
    const el = document.getElementById(idOf(first)) ?? document.querySelector('[role="alert"]');
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus?.({ preventScroll: true });
  });
}

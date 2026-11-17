"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2, X } from "lucide-react";

import { useAction } from "@/components/workspace/actions";
import { cx } from "@/components/ui";

const MAX_QUESTIONS = 10;
const MAX_OPTIONS = 6;
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const blank = () => ({ id: newId(), kind: "choice", prompt: {}, options: [{}, {}], required: true });
const filled = (t) => String(t ?? "").trim() !== "";

/** Is this question fully written in `lang` (its wording and every option)? */
const complete = (q, lang) => filled(q.prompt?.[lang]) && (q.kind !== "choice" || (q.options ?? []).every((o) => filled(o?.[lang])));

/**
 * The Super Admin writes a lesson's feedback questions. Each question can be
 * written in several languages: pick the language at the top, type the
 * wording and options in it, then switch to the next. Learners see the
 * question in the language they answer in (English if it isn't written in
 * theirs). A choice is stored by its position, so answers in every language
 * are counted together.
 */
export default function QuestionsEditor({ moduleId, initial, languages, answeredBy = 0, onDone }) {
  const [list, setList] = useState(() => (initial.length ? structuredClone(initial) : [blank()]));
  const [lang, setLang] = useState("english");
  const { run, busy, error } = useAction();
  const label = languages.find((l) => l.value === lang)?.label ?? lang;

  const update = (i, fn) => setList((l) => l.map((q, n) => (n === i ? fn(structuredClone(q)) : q)));
  const move = (i, by) => setList((l) => {
    const next = [...l];
    const [q] = next.splice(i, 1);
    next.splice(i + by, 0, q);
    return next;
  });

  async function save(e) {
    e.preventDefault();
    const out = await run(`/api/v1/training/${moduleId}/questions`, { questions: list }, { method: "PUT" });
    if (out) onDone?.();
  }

  const written = languages.filter((l) => list.length && list.every((q) => complete(q, l.value)));

  return (
    <form onSubmit={save} className="mt-3 space-y-4 rounded-xl border border-line bg-surface-alt/50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="text-[13px] font-semibold">Writing in</span>
          <select className="input mt-1 !min-h-10 !w-auto !py-1.5" value={lang} onChange={(e) => setLang(e.target.value)}>
            {languages.map((l) => (
              <option key={l.value} value={l.value}>{l.label}{list.every((q) => complete(q, l.value)) ? " ✓" : ""}</option>
            ))}
          </select>
        </label>
        <p className="max-w-md text-[12px] text-ink-muted">
          Write each question in English first, then switch language to add translations.
          People see the question in the language they answer in, or in English if it isn&apos;t translated.
          {written.length > 0 && <> Complete in: <strong className="text-ink">{written.map((l) => l.label).join(", ")}</strong>.</>}
        </p>
      </div>

      {answeredBy > 0 && (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-[13px] text-warning" role="note">
          {answeredBy} {answeredBy === 1 ? "person has" : "people have"} already answered. Fixing wording or adding translations is safe; changing what an option means, or the order of options, changes what their earlier answers mean.
        </p>
      )}

      <ol className="space-y-3">
        {list.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-line bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold">Question {i + 1}</span>
              <select
                className="input !min-h-9 !w-auto !py-1 text-[13px]"
                value={q.kind}
                aria-label={`Question ${i + 1} type`}
                onChange={(e) => update(i, (x) => ({ ...x, kind: e.target.value, options: e.target.value === "choice" ? (x.options?.length ? x.options : [{}, {}]) : null }))}
              >
                <option value="choice">Choose one answer</option>
                <option value="text">Written answer</option>
              </select>
              <label className="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" className="size-4 accent-brand-700" checked={q.required} onChange={(e) => update(i, (x) => ({ ...x, required: e.target.checked }))} /> Must answer
              </label>
              <span className="ml-auto flex gap-0.5">
                <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></IconButton>
                <IconButton label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></IconButton>
                <IconButton label="Remove question" danger onClick={() => setList((l) => l.filter((_, n) => n !== i))}><Trash2 className="size-4" /></IconButton>
              </span>
            </div>

            <label className="mt-2 block">
              <span className="text-[12px] font-semibold text-ink-muted">Question in {label}</span>
              <input
                className="input mt-0.5"
                maxLength={300}
                value={q.prompt?.[lang] ?? ""}
                placeholder={lang !== "english" && q.prompt?.english ? q.prompt.english : "e.g. What should you do if a ballot box is missing?"}
                onChange={(e) => update(i, (x) => ({ ...x, prompt: { ...x.prompt, [lang]: e.target.value } }))}
              />
            </label>

            {q.kind === "choice" && (
              <div className="mt-2 space-y-1.5">
                <span className="text-[12px] font-semibold text-ink-muted">Answers to choose from, in {label}</span>
                {(q.options ?? []).map((o, n) => (
                  <div key={n} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-center text-[12px] font-semibold text-ink-muted">{String.fromCharCode(65 + n)}</span>
                    <input
                      className="input !min-h-10 !py-1.5"
                      maxLength={120}
                      value={o?.[lang] ?? ""}
                      placeholder={lang !== "english" && o?.english ? o.english : `Answer ${String.fromCharCode(65 + n)}`}
                      onChange={(e) => update(i, (x) => ({ ...x, options: x.options.map((y, k) => (k === n ? { ...y, [lang]: e.target.value } : y)) }))}
                    />
                    <IconButton label={`Remove answer ${String.fromCharCode(65 + n)}`} disabled={q.options.length <= 2} onClick={() => update(i, (x) => ({ ...x, options: x.options.filter((_, k) => k !== n) }))}><X className="size-4" /></IconButton>
                  </div>
                ))}
                {q.options.length < MAX_OPTIONS && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(i, (x) => ({ ...x, options: [...x.options, {}] }))}><Plus aria-hidden className="size-4" /> Add an answer</button>
                )}
              </div>
            )}

            <p className="mt-2 flex flex-wrap gap-1">
              {languages.filter((l) => filled(q.prompt?.[l.value])).map((l) => (
                <span key={l.value} className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", complete(q, l.value) ? "bg-brand-50 text-brand-800" : "bg-surface-alt text-ink-muted")}>
                  {complete(q, l.value) && <Check aria-hidden className="size-3" />} {l.label}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ol>

      {list.length < MAX_QUESTIONS && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setList((l) => [...l, blank()])}><Plus aria-hidden className="size-4" /> Add a question</button>
      )}

      {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Save questions</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function IconButton({ label, onClick, disabled, danger, children }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={cx("grid size-8 place-items-center rounded-full hover:bg-surface-alt disabled:opacity-30", danger && "text-danger")}>
      {children}
    </button>
  );
}

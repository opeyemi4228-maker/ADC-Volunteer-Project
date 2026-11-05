"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";

import { useAction } from "@/components/workspace/actions";
import { cx } from "@/components/ui";

/** Lets anyone choose the languages they watch training in. For a volunteer this updates their record. */
export default function LanguagePicker({ current, options }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(() => new Set(current));
  const { run, busy, error, setError } = useAction();

  function toggle(value) {
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function save() {
    if (!chosen.size) return setError("Choose at least one language.");
    const out = await run("/api/v1/training/languages", { languages: [...chosen] }, { method: "PUT" });
    if (out) setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setChosen(new Set(current)); setOpen(true); }}>
        <Languages aria-hidden className="size-4" /> Change languages
      </button>
    );
  }
  return (
    <div className="card w-full p-4 sm:w-[440px]">
      <fieldset>
        <legend className="text-[14px] font-bold">Which languages do you understand?</legend>
        <p className="mt-0.5 text-[13px] text-ink-muted">You will see training videos in these languages only.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((o) => {
            const on = chosen.has(o.value);
            return (
              <label key={o.value} className={cx("flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-[14px] font-medium", on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line hover:border-[#c9cfcc]")}>
                <input type="checkbox" checked={on} onChange={() => toggle(o.value)} className="size-4 accent-brand-700" />
                {o.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-[13px] font-medium text-danger">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Save languages</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, RotateCcw, LayoutGrid, PanelsTopLeft, Users, MapPin } from "lucide-react";

import { POSITIONS, FEATURES, WIDGETS } from "@/lib/positions";
import { useAction } from "@/components/workspace/actions";
import { cx } from "@/components/ui";

const AREA = { ward: "One ward", lga: "One LGA", state: "One state", zone: "One zone", directorate: "One directorate, nationwide" };
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** A switch that is a real checkbox underneath. */
function Toggle({ on, onChange, label, help, disabled, note }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors", on ? "border-brand-200 bg-brand-50/60" : "border-line bg-white hover:border-[#c9d1cd]", disabled && "cursor-not-allowed opacity-55")}>
      <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span aria-hidden className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-500", on ? "bg-brand-600" : "bg-[#cfd6d2]")}>
        <span className={cx("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold leading-5">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-[17px] text-ink-muted">{help}</span>
        {note && <span className="mt-1 block text-[11px] font-semibold text-warning">{note}</span>}
      </span>
    </label>
  );
}

/**
 * Settings → Positions and access. Pick a position on the left; switch its
 * workspace tabs and Overview widgets on or off on the right. Saving applies
 * to everyone holding that position, from their next page load.
 */
export default function PositionsAccess({ access, holders, initial }) {
  const { run, busy, error } = useAction();
  const [current, setCurrent] = useState(POSITIONS.some((p) => p.key === initial) ? initial : POSITIONS[0].key);
  const [draft, setDraft] = useState(access);
  const [saved, setSaved] = useState(access);
  const [flash, setFlash] = useState(false);
  const position = POSITIONS.find((p) => p.key === current);
  const d = draft[current];
  const dirty = !same(d.features, saved[current].features) || !same(d.widgets, saved[current].widgets);
  const isDefault = same(d.features, position.features) && same(d.widgets, position.widgets);
  const anyDirty = useMemo(() => POSITIONS.some((p) => !same(draft[p.key].features, saved[p.key].features) || !same(draft[p.key].widgets, saved[p.key].widgets)), [draft, saved]);

  const set = (patch) => setDraft({ ...draft, [current]: { ...d, ...patch } });
  const toggle = (list, key, on) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));
  function setFeature(key, on) {
    let features = toggle(d.features, key, on);
    // Phone numbers only make sense with the directory.
    if (key === "volunteers" && !on) features = features.filter((k) => k !== "contact");
    if (key === "contact" && on) features = [...new Set([...features, "volunteers"])];
    set({ features });
  }

  async function save() {
    const out = await run("/api/v1/positions", { access: draft });
    if (out) { setSaved(draft); setFlash(true); setTimeout(() => setFlash(false), 2400); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Positions" className="card h-fit p-2">
        <ul className="space-y-0.5">
          {POSITIONS.map((p) => {
            const on = p.key === current;
            const changed = !same(draft[p.key].features, saved[p.key].features) || !same(draft[p.key].widgets, saved[p.key].widgets);
            return (
              <li key={p.key}>
                <button type="button" onClick={() => setCurrent(p.key)} aria-current={on ? "true" : undefined} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", on ? "bg-brand-50" : "hover:bg-surface-alt")}>
                  <span className="min-w-0 flex-1">
                    <span className={cx("flex items-center gap-1.5 text-[14px] font-semibold", on && "text-brand-800")}>
                      {p.label}
                      {changed && <span className="size-1.5 rounded-full bg-accent-500" aria-label="unsaved changes" />}
                    </span>
                    <span className="block text-[12px] text-ink-muted">{draft[p.key].features.length} tabs · {draft[p.key].widgets.length} widgets</span>
                  </span>
                  <span className={cx("rounded-md px-1.5 py-0.5 text-[12px] font-bold num", holders[p.key] ? "bg-white text-ink ring-1 ring-line" : "text-ink-muted")} title="People holding this position">{holders[p.key] ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="card min-w-0 p-5" aria-labelledby="pos-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div className="min-w-0">
            <h2 id="pos-title" className="text-[17px] font-bold tracking-tight">{position.label}</h2>
            <p className="mt-0.5 max-w-xl text-[13px] text-ink-muted">{position.summary}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="size-3.5" /> {AREA[position.area]}</span>
              <span className="inline-flex items-center gap-1.5"><Users aria-hidden className="size-3.5" /> {holders[current] ?? 0} {holders[current] === 1 ? "person holds" : "people hold"} this position</span>
            </p>
          </div>
          <button type="button" onClick={() => set({ features: position.features, widgets: position.widgets })} disabled={isDefault} className="btn btn-secondary btn-sm">
            <RotateCcw aria-hidden className="size-4" /> Reset to default
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="flex items-center gap-2 text-[14px] font-bold"><PanelsTopLeft aria-hidden className="size-4 text-brand-700" /> Workspace tabs</legend>
          <p className="mt-0.5 text-[12px] text-ink-muted">Each tab adds a page to their menu. Records always stay inside their own area.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {FEATURES.map((x) => (
              <Toggle
                key={x.key}
                on={d.features.includes(x.key)}
                onChange={(on) => setFeature(x.key, on)}
                label={x.label}
                help={x.help}
                note={x.key === "field" && d.features.length > 1 && d.features.includes("field") ? "Field registration is usually given on its own." : null}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="flex items-center gap-2 text-[14px] font-bold"><LayoutGrid aria-hidden className="size-4 text-brand-700" /> Overview widgets</legend>
          <p className="mt-0.5 text-[12px] text-ink-muted">What their Overview dashboard shows, for their area.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {WIDGETS.map((w) => (
              <Toggle key={w.key} on={d.widgets.includes(w.key)} onChange={(on) => set({ widgets: toggle(d.widgets, w.key, on) })} label={w.label} help={w.help} />
            ))}
          </div>
        </fieldset>

        <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-line bg-white/95 px-5 py-3.5 backdrop-blur">
          <p className="text-[13px] text-ink-muted" aria-live="polite">
            {flash ? <span className="inline-flex items-center gap-1.5 font-semibold text-success"><Check aria-hidden className="size-4" /> Saved. It applies from their next page load.</span>
              : error ? <span className="font-medium text-danger">{error}</span>
                : anyDirty ? "You have unsaved changes." : "Everything is saved."}
          </p>
          <div className="flex gap-2">
            {dirty && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, [current]: saved[current] })}>Discard</button>}
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || !anyDirty}>
              {busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

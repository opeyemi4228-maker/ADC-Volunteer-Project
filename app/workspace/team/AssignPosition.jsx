"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, ShieldCheck, Loader2, Search, UserRound, Users, ChevronDown } from "lucide-react";

import { DIRECTORATES, VOLUNTEER_ROLES, labelOf } from "@/lib/options";
import { POSITIONS, FEATURES } from "@/lib/positions";
import { loadStates, loadLgas } from "@/components/forms/api";
import { useAction } from "@/components/workspace/actions";
import { StatusBadge, cx, fmt } from "@/components/ui";

const ZONES = [["NC", "North Central"], ["NE", "North East"], ["NW", "North West"], ["SE", "South East"], ["SS", "South South"], ["SW", "South West"]];
const SUPER = { key: "super_admin", label: "Super Admin", area: "national", summary: "Full access nationwide. Only for the supervising body or a deputy." };
const CHOICES = [...POSITIONS, SUPER];
const AREA_WORD = { ward: "ward", lga: "LGA", state: "state", zone: "zone" };
/** "a ward coordinator", "an LGA coordinator". */
const article = (label) => (/^[AEIOU]|^LGA/.test(label) ? "an" : "a");
const lower = (label) => (label === "Super Admin" ? label : label.replace(/^(\w)(\w*)/, (m, a, b) => (m === "LGA" ? m : a.toLowerCase() + b)));

function Step({ n, title, children, done }) {
  return (
    <section className="relative pl-10">
      <span className={cx("absolute left-0 top-0 grid size-7 place-items-center rounded-full text-[12px] font-bold", done ? "bg-brand-700 text-white" : "bg-surface-alt text-ink-muted ring-1 ring-line")}>
        {done ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : n}
      </span>
      <h3 className="pt-0.5 text-[14px] font-bold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Gives a volunteer a coordinator position: choose the position, then the
 * area it covers, then pick from the volunteers registered there (verified
 * first). Their name and phone come from their record, so nothing is typed.
 * A Super Admin account is the one exception: it is an organisation login,
 * so its name and phone are entered.
 */
export default function AssignPosition({ access }) {
  const { run, busy, error, setError } = useAction();
  const [role, setRole] = useState("ward_coordinator");
  const [loc, setLoc] = useState({ zone: "", state: "", lga: "", ward: "", directorate: "" });
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [q, setQ] = useState("");
  const [list, setList] = useState({ items: [], total: 0, page: 1, pages: 1, loading: false });
  const [picked, setPicked] = useState(null);
  const [manual, setManual] = useState({ name: "", phone: "" });
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);
  const reqId = useRef(0);

  const position = CHOICES.find((p) => p.key === role);
  const level = position.area;
  const area = { national: "NG", zone: loc.zone, state: loc.state, lga: loc.lga, ward: loc.ward, directorate: loc.directorate }[level];
  const opens = access[role]?.features ?? [];
  const isSuper = role === "super_admin";
  // A directorate head can be any volunteer nationwide.
  const listArea = level === "directorate" ? (loc.directorate ? "NG" : "") : area;

  useEffect(() => { loadStates().then(setStates).catch(() => setStates([])); }, []);
  useEffect(() => {
    if (!loc.state) { setLgas([]); return; }
    loadLgas(loc.state).then(setLgas).catch(() => setLgas([]));
  }, [loc.state]);
  const wards = lgas.find((l) => l.code === loc.lga)?.wards ?? [];

  async function load(page = 1, append = false) {
    if (!listArea || isSuper) return;
    const id = ++reqId.current;
    setList((l) => ({ ...l, loading: true }));
    try {
      const res = await fetch(`/api/v1/positions/candidates?area=${encodeURIComponent(listArea)}&q=${encodeURIComponent(q.trim())}&page=${page}`);
      const out = await res.json();
      if (id !== reqId.current) return;
      setList((l) => ({ ...out, items: append ? [...l.items, ...out.items] : out.items, loading: false }));
    } catch {
      if (id === reqId.current) setList((l) => ({ ...l, loading: false }));
    }
  }

  // The list follows the chosen area and the search, a moment after typing stops.
  useEffect(() => {
    setPicked(null);
    if (!listArea || isSuper) { setList({ items: [], total: 0, page: 1, pages: 1, loading: false }); return undefined; }
    const timer = setTimeout(() => load(1), q ? 250 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listArea, q, isSuper]);

  function choose(next) {
    setRole(next);
    setDone(null);
    setError("");
    const from = CHOICES.find((p) => p.key === next).area;
    if (from !== level) setQ("");
  }

  async function submit(e) {
    e.preventDefault();
    const payload = isSuper ? { role, ...manual } : { role, area, volunteerId: picked?.id };
    const out = await run("/api/v1/users", payload);
    if (out) {
      setDone({ ...out, name: out.name ?? picked?.name ?? manual.name, label: position.label });
      setCopied(false);
      setManual({ name: "", phone: "" });
      setPicked(null);
      load(1);
    }
  }

  const select = (label, value, onChange, options, placeholder, disabled) => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-ink-muted">{label}</span>
      <select className="input !min-h-11 !text-[15px]" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  const areaReady = isSuper || Boolean(area);
  const ready = isSuper ? manual.name.trim().length >= 3 && manual.phone.trim() : Boolean(picked);

  return (
    <form onSubmit={submit} className="card @container h-fit min-w-0 p-5">
      <h2 className="text-[16px] font-bold tracking-tight">Give a volunteer a position</h2>
      <p className="mt-0.5 text-[13px] text-ink-muted">Choose the position and the area. The volunteers registered there are listed for you to pick from.</p>

      {done && (
        <div role="status" className="mt-4 rounded-xl border border-success/25 bg-success-bg p-3.5 text-[14px]">
          <p className="flex items-center gap-2 font-semibold text-success"><Check aria-hidden className="size-4" /> {done.name} is now {article(done.label)} {lower(done.label)}.</p>
          {done.password ? (
            <div className="mt-2">
              <p className="text-[13px]">They had no password yet. Share this one-time password with them privately:</p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="rounded-lg bg-white px-2.5 py-1.5 font-mono text-[15px] font-bold tracking-wide">{done.password}</code>
                <button type="button" className="btn btn-secondary btn-sm !min-h-9" onClick={async () => { try { await navigator.clipboard.writeText(done.password); setCopied(true); } catch { /* blocked */ } }}>
                  {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[13px]">They sign in with their usual phone number and password; their new tabs appear straight away.</p>
          )}
        </div>
      )}

      <div className="mt-5 space-y-6">
        <Step n={1} title="Position" done>
          <div className="grid gap-2 @md:grid-cols-2 @4xl:grid-cols-4">
            {CHOICES.map((p) => {
              const on = p.key === role;
              return (
                <label key={p.key} className={cx("relative flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors", on ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-line hover:border-[#c9d1cd]")}>
                  <input type="radio" name="role" value={p.key} checked={on} onChange={() => choose(p.key)} className="sr-only" />
                  <span aria-hidden className={cx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", on ? "border-brand-700" : "border-[#b9c1bd]")}>
                    {on && <span className="size-2 rounded-full bg-brand-700" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[14px] font-semibold">{p.key === "super_admin" && <ShieldCheck aria-hidden className="size-4 text-brand-700" />}{p.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-[17px] text-ink-muted">{p.summary}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {!isSuper && (
            <div className="mt-3 rounded-xl bg-surface-alt px-3.5 py-3">
              <p className="text-[12px] font-semibold text-ink-muted">Opens these tabs</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {opens.length ? opens.map((k) => (
                  <li key={k} className="rounded-md bg-white px-2 py-0.5 text-[12px] font-semibold ring-1 ring-line">{FEATURES.find((x) => x.key === k)?.label}</li>
                )) : <li className="text-[12px] text-ink-muted">Overview only</li>}
              </ul>
              <Link href={`/workspace/team?tab=access&position=${role}`} className="mt-2 inline-block text-[12px] font-semibold text-brand-700 hover:underline">
                Change what {article(position.label)} {lower(position.label)} can open
              </Link>
            </div>
          )}
        </Step>

        {!isSuper && (
          <Step n={2} title={level === "directorate" ? "Directorate" : `The ${AREA_WORD[level]} they will cover`} done={Boolean(area)}>
            <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
              {level === "zone" && select("Zone", loc.zone, (v) => setLoc({ ...loc, zone: v }), ZONES, "Choose a zone")}
              {level === "directorate" && select("Directorate", loc.directorate, (v) => setLoc({ ...loc, directorate: v }), DIRECTORATES.map((d) => [d.value, d.label]), "Choose a directorate")}
              {["state", "lga", "ward"].includes(level) && select("State", loc.state, (v) => setLoc({ ...loc, state: v, lga: "", ward: "" }), states.map((s) => [s.code, s.name]), states.length ? "Choose a state" : "Loading…")}
              {["lga", "ward"].includes(level) && select("LGA", loc.lga, (v) => setLoc({ ...loc, lga: v, ward: "" }), lgas.map((l) => [l.code, l.name]), loc.state ? "Choose an LGA" : "Choose a state first", !loc.state)}
              {level === "ward" && select("Ward", loc.ward, (v) => setLoc({ ...loc, ward: v }), wards.map((w) => [w.code, w.name]), loc.lga ? "Choose a ward" : "Choose an LGA first", !loc.lga)}
            </div>
          </Step>
        )}

        {isSuper ? (
          <Step n={2} title="Account details" done={Boolean(ready)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5"><span className="text-[12px] font-semibold text-ink-muted">Account name</span><input className="input !min-h-11 !text-[15px]" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="e.g. ADC Supervising Body (deputy)" autoComplete="off" /></label>
              <label className="flex flex-col gap-1.5"><span className="text-[12px] font-semibold text-ink-muted">Phone number</span><input className="input !min-h-11 !text-[15px]" inputMode="tel" value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} placeholder="0803 123 4567" autoComplete="off" /></label>
            </div>
          </Step>
        ) : (
          <Step n={3} title="Choose the volunteer" done={Boolean(picked)}>
            {!areaReady ? (
              <p className="flex items-center gap-2.5 rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-ink-muted">
                <Users aria-hidden className="size-5 shrink-0" /> Choose the {level === "directorate" ? "directorate" : AREA_WORD[level]} first. Everyone registered there will be listed here.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="flex items-center gap-2 border-b border-line bg-surface-alt/60 px-3">
                  <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by name or volunteer ID"
                    aria-label="Search volunteers"
                    className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-muted"
                  />
                  <span className="shrink-0 text-[12px] font-semibold text-ink-muted num" aria-live="polite">{list.loading ? "…" : `${fmt(list.total)} found`}</span>
                </div>
                <ul role="radiogroup" aria-label="Volunteers" className="grid max-h-[380px] divide-y @4xl:grid-cols-2 @4xl:divide-y-0 @4xl:[&>li]:border-b @4xl:[&>li]:border-line @4xl:[&>li:nth-child(odd)]:border-r overflow-y-auto divide-line overflow-y-auto">
                  {list.items.map((v) => {
                    const on = picked?.id === v.id;
                    return (
                      <li key={v.id}>
                        <label className={cx("flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors", on ? "bg-brand-50" : "hover:bg-surface-alt")}>
                          <input type="radio" name="volunteer" className="sr-only" checked={on} onChange={() => setPicked(v)} />
                          <span aria-hidden className={cx("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold", on ? "bg-brand-700 text-white" : "bg-surface-alt text-ink-muted")}>
                            {on ? <Check className="size-4" strokeWidth={3} /> : v.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[14px] font-semibold">{v.name}</span>
                              <StatusBadge status={v.status} className="!px-1.5 !py-0 !text-[11px]" />
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-ink-muted"><span className="font-mono">{v.publicId}</span> · {v.place}</span>
                            {(v.positions.length > 0 || v.offers.length > 0) && (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {v.positions.map((p) => <span key={p} className="rounded bg-info-bg px-1.5 py-0.5 text-[11px] font-semibold text-info">Already {lower(p)}</span>)}
                                {v.offers.slice(0, 3).map((o) => <span key={o} className="rounded bg-surface-alt px-1.5 py-0.5 text-[11px] text-ink-muted">{labelOf(VOLUNTEER_ROLES, o)}</span>)}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                  {!list.loading && list.items.length === 0 && (
                    <li className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[13px] text-ink-muted">
                      <UserRound aria-hidden className="size-6" />
                      {q ? `No volunteer here matches “${q}”.` : "No volunteers are registered in this area yet."}
                    </li>
                  )}
                  {list.loading && list.items.length === 0 && (
                    <li className="flex items-center justify-center gap-2 px-4 py-8 text-[13px] text-ink-muted"><Loader2 aria-hidden className="size-4 animate-spin" /> Loading volunteers…</li>
                  )}
                </ul>
                {list.page < list.pages && (
                  <button type="button" onClick={() => load(list.page + 1, true)} disabled={list.loading} className="flex h-10 w-full items-center justify-center gap-1.5 border-t border-line text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
                    {list.loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ChevronDown aria-hidden className="size-4" />} Show more
                  </button>
                )}
              </div>
            )}
          </Step>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-[14px] font-medium text-danger">{error}</p>}
      <button className="btn btn-primary mt-6 w-full @4xl:ml-auto @4xl:flex @4xl:w-auto @4xl:min-w-72" disabled={busy || !ready}>
        {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {isSuper ? "Add Super Admin account" : picked ? `Make ${picked.name.split(" ")[0]} ${article(position.label)} ${lower(position.label)}` : `Add ${lower(position.label)}`}
      </button>
    </form>
  );
}

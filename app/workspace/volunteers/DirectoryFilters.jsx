"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";

import {
  VOLUNTEER_ROLES, PVC_STATUS, GENDERS, AGE_BANDS, AVAILABILITY, LANGUAGES, REGISTRATION_CHANNELS,
} from "@/lib/options";
import { cx } from "@/components/ui";

const MORE = ["gender", "age", "availability", "language", "smartphone", "phone", "affiliation", "channel", "from", "to", "nopu", "flagged"];

/** Builds the directory URL from the current query with some keys changed; any change goes back to page 1. */
export function directoryHref(base, query, changes) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, page: "", ...changes })) if (v != null && v !== "" && v !== false) q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * The directory's filters. Each change navigates straight away (search waits
 * for a pause in typing), so the URL always describes the list on screen and
 * a filtered view can be bookmarked or sent to a colleague.
 */
export default function DirectoryFilters({ query, levels }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(query.q ?? "");
  const [more, setMore] = useState(() => MORE.some((k) => query[k]));
  const typing = useRef(null);

  useEffect(() => setQ(query.q ?? ""), [query.q]);

  const go = (changes) => start(() => router.push(directoryHref(pathname, query, changes), { scroll: false }));
  const onSearch = (value) => {
    setQ(value);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => go({ q: value.trim() }), 450);
  };
  const moreCount = MORE.filter((k) => query[k]).length;

  const select = (name, label, options, { all = "All" } = {}) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
      <select value={query[name] ?? ""} onChange={(e) => go({ [name]: e.target.value })} className="input !min-h-10 !py-1.5 text-[15px]">
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="card mb-4 p-3 sm:p-4" aria-busy={pending}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          clearTimeout(typing.current);
          go({ q: q.trim() });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex min-w-[min(100%,16rem)] flex-[2_1_16rem] flex-col gap-1">
          <span className="text-[13px] font-semibold text-ink-muted">Search</span>
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input type="search" value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Name, ID or phone" className="input !min-h-10 !py-1.5 !pl-9" />
          </span>
        </label>

        {levels.map((l) => (
          <label key={l.key} className="flex min-w-[9rem] flex-1 flex-col gap-1">
            <span className="text-[13px] font-semibold text-ink-muted">{l.label}</span>
            <select value={l.value} onChange={(e) => go({ area: e.target.value || l.parent })} className="input !min-h-10 !py-1.5 text-[15px]">
              <option value="">{l.all}</option>
              {l.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}

        <div className="min-w-[9rem] flex-1">{select("role", "Role", VOLUNTEER_ROLES)}</div>
        <div className="min-w-[9rem] flex-1">{select("pvc", "PVC", PVC_STATUS)}</div>

        <button type="button" onClick={() => setMore(!more)} aria-expanded={more} aria-controls="more-filters" className={cx("btn btn-sm", more || moreCount ? "btn-secondary" : "btn-ghost")}>
          <SlidersHorizontal aria-hidden className="size-4" /> More filters{moreCount ? <span className="num"> ({moreCount})</span> : ""}
        </button>
        {pending && <Loader2 aria-label="Updating" className="mb-3 size-4 animate-spin text-ink-muted" />}
      </form>

      {more && (
        <div id="more-filters" className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {select("gender", "Gender", GENDERS)}
          {select("age", "Age", AGE_BANDS)}
          {select("availability", "Availability", AVAILABILITY)}
          {select("language", "Language", LANGUAGES)}
          {select("smartphone", "Smartphone", [{ value: "yes", label: "Has one" }, { value: "no", label: "None" }])}
          {select("phone", "Phone", [{ value: "confirmed", label: "Confirmed" }, { value: "unconfirmed", label: "Not confirmed" }])}
          {select("affiliation", "Support group", [{ value: "group", label: "In a group" }, { value: "none", label: "Not in a group" }])}
          {select("channel", "Registered through", REGISTRATION_CHANNELS)}
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] font-semibold text-ink-muted">Registered from</span>
            <input type="date" value={query.from ?? ""} max={query.to || undefined} onChange={(e) => go({ from: e.target.value })} className="input !min-h-10 !py-1.5" />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] font-semibold text-ink-muted">Registered to</span>
            <input type="date" value={query.to ?? ""} min={query.from || undefined} onChange={(e) => go({ to: e.target.value })} className="input !min-h-10 !py-1.5" />
          </label>
          <label className="flex min-h-10 items-center gap-2 self-end text-[14px] font-medium">
            <input type="checkbox" checked={Boolean(query.nopu)} onChange={(e) => go({ nopu: e.target.checked ? "1" : "" })} className="size-5 accent-brand-700" /> No polling unit
          </label>
          <label className="flex min-h-10 items-center gap-2 self-end text-[14px] font-medium">
            <input type="checkbox" checked={Boolean(query.flagged)} onChange={(e) => go({ flagged: e.target.checked ? "1" : "" })} className="size-5 accent-brand-700" /> Possible duplicates
          </label>
        </div>
      )}
    </div>
  );
}

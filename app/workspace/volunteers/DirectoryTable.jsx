"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Copy, X } from "lucide-react";

import { VOLUNTEER_ROLES, PVC_STATUS, REGISTRATION_CHANNELS, labelOf } from "@/lib/options";
import { StatusBadge, cx, dateLabel, fmt } from "@/components/ui";
import DownloadVolunteers from "@/components/workspace/DownloadVolunteers";
import { directoryHref } from "./DirectoryFilters";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Surname A–Z" },
  { value: "name_desc", label: "Surname Z–A" },
  { value: "place", label: "By place" },
  { value: "status", label: "Waiting first" },
];
const PVC_SHORT = { yes: "Yes", not_collected: "Not collected", not_registered: "Not registered" };
const GENDER_SHORT = { male: "M", female: "F" };

export default function DirectoryTable({ rows, total, page, per, sizes, query, downloadMode, showPhone }) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState(() => new Set());
  const [copied, setCopied] = useState(false);
  const selectable = Boolean(downloadMode);
  const sort = query.sort ?? "newest";
  const first = total ? (page - 1) * per + 1 : 0;
  const last = Math.min(total, page * per);

  // A new page of results starts with nothing selected.
  const pageKey = rows.map((r) => r.id).join(",");
  useEffect(() => setSelected(new Set()), [pageKey]);

  const go = (changes) => router.push(directoryHref(pathname, query, changes), { scroll: false });
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const chosen = rows.filter((r) => selected.has(r.id));

  async function copyIds() {
    await navigator.clipboard?.writeText(chosen.map((r) => r.public_id).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const SortHead = ({ label, asc, desc, className }) => {
    const active = sort === asc || sort === desc;
    const next = sort === asc ? desc : asc;
    const Icon = !active ? ArrowUpDown : sort === asc ? ArrowUp : ArrowDown;
    return (
      <th className={className} aria-sort={active ? (sort === asc ? "ascending" : "descending") : undefined}>
        <Link href={directoryHref(pathname, query, { sort: next })} scroll={false} className="inline-flex items-center gap-1 hover:text-ink">
          {label} <Icon aria-hidden className={cx("size-3.5", active ? "text-ink" : "opacity-50")} />
        </Link>
      </th>
    );
  };

  return (
    <div>
      <div className="mb-2 flex min-h-12 flex-wrap items-center justify-between gap-3">
        {chosen.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5" role="region" aria-label="Selected volunteers">
            <span className="text-[14px] font-semibold num">{chosen.length} selected</span>
            <DownloadVolunteers
              mode={downloadMode}
              filters={{ ids: chosen.map((r) => r.id).join(",") }}
              count={chosen.length}
              described={[{ label: "Selection", value: `${chosen.length} chosen on this page` }]}
              label={downloadMode === "direct" ? "Download selected" : "Request selected"}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyIds}><Copy aria-hidden className="size-4" /> {copied ? "Copied" : "Copy IDs"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}><X aria-hidden className="size-4" /> Clear</button>
          </div>
        ) : (
          <p className="text-[14px] text-ink-muted num">
            {total ? <>Showing <span className="font-semibold text-ink">{fmt(first)}–{fmt(last)}</span> of <span className="font-semibold text-ink">{fmt(total)}</span></> : "No records"}
          </p>
        )}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[14px]">
            <span className="text-ink-muted">Sort</span>
            <select value={sort} onChange={(e) => go({ sort: e.target.value === "newest" ? "" : e.target.value })} className="input !min-h-9 !w-auto !py-1 text-[14px]">
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <span className="text-ink-muted">Show</span>
            <select value={per} onChange={(e) => go({ per: Number(e.target.value) === sizes[0] ? "" : e.target.value })} className="input !min-h-9 !w-auto !py-1 text-[14px]">
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Phones and small tablets: one card per volunteer. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((v) => (
          <li key={v.id} className={cx("card flex gap-3 p-3", selected.has(v.id) && "border-brand-600 bg-brand-50/50")}>
            {selectable && <input type="checkbox" aria-label={`Select ${v.first_name} ${v.surname}`} checked={selected.has(v.id)} onChange={() => toggle(v.id)} className="mt-1 size-5 shrink-0 accent-brand-700" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/workspace/volunteers/${v.id}`} className="min-w-0 font-semibold text-brand-800 hover:underline">{v.first_name} {v.surname}</Link>
                <StatusBadge status={v.status} />
              </div>
              <p className="text-[13px] text-ink-muted num">{v.public_id}{v.age != null ? ` · ${GENDER_SHORT[v.gender] ?? ""}${GENDER_SHORT[v.gender] ? ", " : ""}${v.age}` : ""}{showPhone && v.phone ? ` · ${v.phone}` : ""}</p>
              <p className="mt-1 text-[14px]">{v.ward_name}, {v.lga_name}</p>
              <p className="text-[13px] text-ink-muted">
                {v.pu_name ?? <span className="font-semibold text-warning">No polling unit</span>} · PVC {PVC_SHORT[v.pvc_status]?.toLowerCase()}
              </p>
              {v.flags > 0 && <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-warning"><AlertTriangle aria-hidden className="size-3.5" /> Possible duplicate</p>}
            </div>
          </li>
        ))}
      </ul>

      <div className="card hidden overflow-x-auto md:block">
        <table className="table-clean">
          <thead>
            <tr>
              {selectable && (
                <th className="w-10">
                  <input type="checkbox" aria-label="Select every volunteer on this page" checked={allOnPage} onChange={toggleAll} className="size-4 accent-brand-700" />
                </th>
              )}
              <SortHead label="Volunteer" asc="name" desc="name_desc" />
              {showPhone && <th className="hidden 2xl:table-cell">Phone</th>}
              <SortHead label="Votes in" asc="place" desc="place_desc" />
              <th>Polling unit</th>
              <th>PVC</th>
              <th>Roles</th>
              <SortHead label="Status · registered" asc="status" desc="status" />
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className={selected.has(v.id) ? "[&>td]:!bg-brand-50" : undefined}>
                {selectable && (
                  <td>
                    <input type="checkbox" aria-label={`Select ${v.first_name} ${v.surname}`} checked={selected.has(v.id)} onChange={() => toggle(v.id)} className="mt-0.5 size-4 accent-brand-700" />
                  </td>
                )}
                <td className="min-w-44">
                  <Link href={`/workspace/volunteers/${v.id}`} className="font-semibold text-brand-800 hover:underline">{v.first_name} {v.surname}</Link>
                  <div className="whitespace-nowrap text-[13px] text-ink-muted num">{v.public_id}{v.age != null && <> · {GENDER_SHORT[v.gender] ? `${GENDER_SHORT[v.gender]}, ` : ""}{v.age}</>}</div>
                  {v.flags > 0 && <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-warning"><AlertTriangle aria-hidden className="size-3.5" /> Possible duplicate</div>}
                </td>
                {showPhone && <td className="hidden whitespace-nowrap text-[14px] num 2xl:table-cell">{v.phone}{v.phone_verified_at ? "" : <div className="text-[12px] text-ink-muted">Not confirmed</div>}</td>}
                <td className="min-w-32 text-[14px]">
                  <div>{v.ward_name}</div>
                  <div className="text-[13px] text-ink-muted">{v.lga_name}</div>
                </td>
                <td className="max-w-36 text-[14px] 2xl:max-w-48">
                  {v.vote_pu_code ? (
                    <>
                      <div className="truncate" title={v.pu_name}>{v.pu_name}</div>
                      <div className="text-[12px] text-ink-muted num">{v.vote_pu_code}</div>
                    </>
                  ) : <span className="font-semibold text-warning">None</span>}
                </td>
                <td className={cx("whitespace-nowrap text-[14px]", v.pvc_status !== "yes" && "text-ink-muted")} title={labelOf(PVC_STATUS, v.pvc_status)}>{PVC_SHORT[v.pvc_status]}</td>
                <td className="max-w-36 2xl:max-w-48">
                  <div className="flex items-center gap-1" title={v.roles.map((r) => labelOf(VOLUNTEER_ROLES, r)).join(", ")}>
                    {v.roles[0] && <span className="truncate rounded bg-surface-alt px-1.5 py-0.5 text-[12px] font-medium">{labelOf(VOLUNTEER_ROLES, v.roles[0])}</span>}
                    {v.roles.length > 1 && <span className="shrink-0 text-[12px] font-semibold text-ink-muted">+{v.roles.length - 1}</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap">
                  <StatusBadge status={v.status} />
                  <div className="mt-1 text-[12px] text-ink-muted">{dateLabel(v.created_at, { day: "numeric", month: "short", year: "2-digit" })} · {labelOf(REGISTRATION_CHANNELS, v.registration_channel)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

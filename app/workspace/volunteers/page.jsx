import { redirect } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

import { requireViewer } from "@/lib/guard";
import { volunteerRows, volunteerSummary, PAGE_SIZES } from "@/lib/workspace-data";
import { describeFilters, onlyFilters } from "@/lib/volunteer-columns";
import { homeArea } from "@/lib/scope";
import { ZONES, areaName, stateList, statesInZone, stateTree, lgaOf } from "@/lib/geo";
import { EmptyState, Stat, fmt, pct } from "@/components/ui";
import { PageHeader, Tabs, Pagination, withParams } from "@/components/workspace/ui";
import DownloadVolunteers from "@/components/workspace/DownloadVolunteers";
import DirectoryFilters from "./DirectoryFilters";
import DirectoryTable from "./DirectoryTable";

export const metadata = { title: "Volunteers" };

const BASE = "/workspace/volunteers";

/**
 * Location filters from the viewer's own area downwards: a national admin
 * starts at zones, a state coordinator at LGAs, an LGA coordinator at wards.
 * Each level lists the children of the level above it. Clearing a level goes
 * back to its parent (`parent`), not to everything.
 */
function locationLevels(home, area) {
  const t = home?.type;
  const zone = area.length === 2 ? area : area.length >= 3 ? stateList.find((s) => s.code === area.slice(0, 3))?.zone ?? "" : "";
  const state = area.length >= 3 ? area.slice(0, 3) : t === "state" ? home.code : "";
  const lga = area.length >= 7 ? area.slice(0, 7) : t === "lga" ? home.code : "";
  const ward = area.length >= 10 ? area.slice(0, 10) : "";
  const levels = [];
  if (t === "national") {
    levels.push({ key: "zone", label: "Zone", all: "All zones", value: zone, parent: "", options: Object.entries(ZONES).map(([value, label]) => ({ value, label })) });
    levels.push({ key: "state", label: "State", all: zone ? `All of ${ZONES[zone]}` : "All states", value: state, parent: zone, options: stateList.filter((s) => !zone || s.zone === zone).map((s) => ({ value: s.code, label: s.name })) });
  }
  if (t === "zone") levels.push({ key: "state", label: "State", all: "All states", value: state, parent: "", options: statesInZone(home.code).map((c) => ({ value: c, label: areaName(c) })) });
  if (["national", "zone", "state"].includes(t) && state) {
    levels.push({ key: "lga", label: "LGA", all: "All LGAs", value: lga, parent: t === "state" ? "" : state, options: (stateTree(state)?.lgas ?? []).map((l) => ({ value: l.code, label: l.name })) });
  }
  if (["national", "zone", "state", "lga"].includes(t) && lga) {
    levels.push({ key: "ward", label: "Ward", all: "All wards", value: ward, parent: t === "lga" ? "" : lga, options: (lgaOf(lga)?.wards ?? []).map((w) => ({ value: w.code, label: w.name })) });
  }
  return levels;
}

export default async function VolunteersPage({ searchParams }) {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("view_volunteers")) redirect("/workspace");
  const sp = await searchParams;
  const filters = onlyFilters(sp);
  const query = { ...filters, ...(sp.sort ? { sort: sp.sort } : {}), ...(sp.per ? { per: sp.per } : {}) };
  const [list, sum] = await Promise.all([volunteerRows(viewer, sp), volunteerSummary(viewer, sp)]);
  const home = homeArea(viewer);
  const super_ = viewer.powers.includes("approve_export");
  const downloadMode = super_ ? "direct" : viewer.powers.includes("request_export") ? "request" : null;
  const described = describeFilters(filters, areaName);
  const scopeName = home?.type === "national" ? "Nigeria" : areaName(home?.code);

  const statusTabs = [
    { key: "", label: "All", count: sum.all },
    { key: "pending", label: "Pending", count: sum.byStatus.pending ?? 0 },
    { key: "info_requested", label: "Info requested", count: sum.byStatus.info_requested ?? 0 },
    { key: "verified", label: "Verified", count: sum.byStatus.verified ?? 0 },
    { key: "rejected", label: "Rejected", count: sum.byStatus.rejected ?? 0 },
  ].map((tab) => ({ ...tab, count: fmt(tab.count), href: withParams(BASE, query, { status: tab.key, queue: "" }) }));

  return (
    <>
      <PageHeader
        eyebrow={super_ ? "Super admin" : undefined}
        title="Volunteers"
        description={`Everyone registered in ${filters.area ? areaName(filters.area) : scopeName}. Filter by place, role, PVC and more, then download exactly the list you need.`}
        actions={downloadMode && (
          <DownloadVolunteers
            mode={downloadMode}
            filters={filters}
            count={list.total}
            described={described}
            label={downloadMode === "direct" ? `Download ${fmt(list.total)}` : "Request export"}
          />
        )}
      />

      <Tabs tabs={statusTabs} current={filters.status ?? ""} />

      <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Matching" value={fmt(sum.total)} sub={sum.new7 ? `${fmt(sum.new7)} new this week` : "None new this week"} />
        <Stat label="PVC ready" value={pct(sum.pvc, sum.total)} sub={`${fmt(sum.pvc)} have their PVC`} />
        <Stat label="Polling unit agents" value={fmt(sum.agents)} sub="Willing to take the role" />
        <Stat label="Phone confirmed" value={pct(sum.phoneConfirmed, sum.total)} sub={`${fmt(sum.phoneConfirmed)} confirmed`} />
        <Stat label="No polling unit" value={fmt(sum.nopu)} tone={sum.nopu ? "warn" : undefined} sub={sum.nopu && !filters.nopu ? <Link className="link" href={withParams(BASE, query, { nopu: "1" })}>Show them</Link> : "Ward only"} />
        <Stat label="Women" value={pct(sum.female, sum.total)} sub={`${fmt(sum.female)} women, ${fmt(sum.male)} men`} />
      </div>

      <DirectoryFilters query={query} levels={locationLevels(home, filters.area ?? "")} />

      {described.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
          {described.map((d) => (
            <Link key={d.key} href={withParams(BASE, query, { [d.key]: "", page: "" })} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface-alt pl-3 pr-2 text-[13px] hover:border-ink-muted">
              <span className="text-ink-muted">{d.label}:</span> <span className="font-semibold">{d.value}</span>
              <X aria-hidden className="size-3.5" />
              <span className="sr-only">Remove this filter</span>
            </Link>
          ))}
          <Link href={withParams(BASE, { sort: query.sort, per: query.per }, {})} className="ml-1 text-[13px] font-semibold text-brand-700 hover:underline">Clear all</Link>
        </div>
      )}

      {list.rows.length === 0 ? (
        <EmptyState title="No volunteers match">
          {described.length ? "Try removing a filter or two." : "Nobody has registered in your area yet."}
        </EmptyState>
      ) : (
        <DirectoryTable
          rows={list.rows}
          total={list.total}
          page={list.page}
          per={list.per}
          sizes={PAGE_SIZES}
          query={query}
          downloadMode={downloadMode}
          showPhone={!viewer.powers.includes("summary_only")}
        />
      )}
      <Pagination page={list.page} pages={list.pages} total={list.total} hrefFor={(p) => withParams(BASE, query, { page: p })} />
    </>
  );
}

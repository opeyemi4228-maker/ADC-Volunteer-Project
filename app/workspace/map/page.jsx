import Link from "next/link";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { all } from "@/lib/db";
import { scopeSql } from "@/lib/scope";
import { coverage } from "@/lib/workspace-data";
import { resolveArea, breadcrumb } from "@/lib/workspace-area";
import { lgaOf, wardUnits, areaName } from "@/lib/geo";
import { Card, fmt, pct } from "@/components/ui";
import { PageHeader, Tabs, withParams } from "@/components/workspace/ui";
import CoverageMap from "@/components/workspace/charts/CoverageMap";

export const metadata = { title: "Map and coverage" };

const METRICS = [
  { key: "volunteers", label: "Volunteers", valueKey: "volunteers", format: "number" },
  { key: "pvc", label: "PVC readiness", valueKey: "pvcRate", format: "percent" },
  { key: "pu", label: "Polling unit coverage", valueKey: "puRate", format: "percent" },
  { key: "groups", label: "Verified groups", valueKey: "groups", format: "number" },
];

export default async function MapPage({ searchParams }) {
  const viewer = await getViewer();
  if (!viewer.powers.includes("verify")) redirect("/workspace");
  const sp = await searchParams;
  const area = resolveArea(viewer, sp.area);
  const metric = METRICS.find((m) => m.key === sp.metric) ?? METRICS[0];
  const crumbs = breadcrumb(area).map((c) => ({ label: c.name, href: withParams("/workspace/map", {}, { area: c.code, metric: sp.metric }) }));
  const drawable = ["national", "zone", "state"].includes(area.type);
  const map = drawable ? coverage(viewer, area.type, area.code) : null;
  const drillBase = `/workspace/map?${sp.metric ? `metric=${sp.metric}&` : ""}area=`;

  // Gaps: wards (for an LGA) or polling units (for a ward) with nobody.
  let gaps = null;
  const V = scopeSql(viewer, "volunteer", "v");
  if (area.type === "lga") {
    const counts = new Map(all(`SELECT v.vote_ward_code AS c, COUNT(*) AS n, COUNT(DISTINCT v.vote_pu_code) AS pus FROM volunteers v WHERE ${V.sql} AND v.vote_lga_code = :l GROUP BY c`, { ...V.params, l: area.code }).map((r) => [r.c, r]));
    const groups = new Set(all("SELECT ward_code AS c FROM support_groups WHERE status = 'verified' AND lga_code = :l UNION SELECT area_code FROM group_areas_covered a JOIN support_groups g ON g.id = a.group_id WHERE g.status = 'verified'", { l: area.code }).map((r) => r.c));
    gaps = { kind: "ward", rows: lgaOf(area.code).wards.map((w) => ({ code: w.code, name: w.name, volunteers: counts.get(w.code)?.n ?? 0, pus: counts.get(w.code)?.pus ?? 0, totalPus: w.units, hasGroup: groups.has(w.code) })) };
  }
  if (area.type === "ward") {
    const counts = new Map(all(`SELECT v.vote_pu_code AS c, COUNT(*) AS n FROM volunteers v WHERE ${V.sql} AND v.vote_ward_code = :w AND v.vote_pu_code IS NOT NULL GROUP BY c`, { ...V.params, w: area.code }).map((r) => [r.c, r.n]));
    const agents = new Map(all("SELECT pu_code AS c, COUNT(*) AS n FROM pu_agents WHERE pu_code LIKE :w || '%' GROUP BY pu_code", { w: area.code }).map((r) => [r.c, r.n]));
    gaps = { kind: "pu", rows: wardUnits(area.code).map((u) => ({ code: u.code, name: u.name, volunteers: counts.get(u.code) ?? 0, agents: agents.get(u.code) ?? 0 })) };
  }
  const onlyGaps = sp.view === "gaps";
  const shownGaps = gaps ? (onlyGaps ? gaps.rows.filter((r) => (gaps.kind === "ward" ? !r.hasGroup || r.volunteers === 0 : r.volunteers === 0)) : gaps.rows) : [];

  return (
    <>
      <PageHeader crumbs={crumbs.length > 1 ? crumbs : undefined} title={`Coverage: ${areaName(area.code) || "Nigeria"}`} description="Where we have people, and where we don't yet. Select an area to go down a level." />
      {map && (
        <>
          <Tabs current={metric.key} tabs={METRICS.map((m) => ({ key: m.key, label: m.label, href: withParams("/workspace/map", { area: sp.area }, { metric: m.key }) }))} />
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card className="p-4 sm:p-5">
              <CoverageMap level={map.level} stateCode={area.code.slice(0, 3)} values={map.values} valueKey={metric.valueKey} format={metric.format} metricLabel={metric.label} hrefBase={drillBase} />
            </Card>
            <Card className="max-h-[560px] overflow-auto">
              <table className="table-clean">
                <thead><tr><th>{map.level === "state" ? "State" : "LGA"}</th><th className="text-right">{metric.label}</th><th className="text-right">PUs covered</th></tr></thead>
                <tbody>
                  {[...map.values].sort((a, b) => b[metric.valueKey] - a[metric.valueKey]).map((v) => (
                    <tr key={v.code}>
                      <td><Link className="link" href={`${drillBase}${v.code}`}>{v.name}</Link></td>
                      <td className="num text-right">{metric.format === "percent" ? pct(v[metric.valueKey], 1) : fmt(v[metric.valueKey])}</td>
                      <td className="num text-right">{fmt(v.pus)} / {fmt(v.totalPus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}

      {gaps && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link className="chip" aria-pressed={!onlyGaps} href={withParams("/workspace/map", { area: area.code }, {})}>All {gaps.kind === "ward" ? "wards" : "polling units"}</Link>
            <Link className="chip" aria-pressed={onlyGaps} href={withParams("/workspace/map", { area: area.code }, { view: "gaps" })}>Gaps only</Link>
          </div>
          <Card className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                {gaps.kind === "ward" ? (
                  <tr><th>Ward</th><th className="text-right">Volunteers</th><th className="text-right">PUs covered</th><th>Verified group</th></tr>
                ) : (
                  <tr><th>Polling unit</th><th>Code</th><th className="text-right">Volunteers</th><th className="text-right">Agents</th></tr>
                )}
              </thead>
              <tbody>
                {shownGaps.map((r) => gaps.kind === "ward" ? (
                  <tr key={r.code}>
                    <td><Link className="link" href={`/workspace/map?area=${r.code}`}>{r.name}</Link></td>
                    <td className={`num text-right ${r.volunteers ? "" : "font-semibold text-danger"}`}>{fmt(r.volunteers)}</td>
                    <td className="num text-right">{fmt(r.pus)} / {fmt(r.totalPus)}</td>
                    <td>{r.hasGroup ? "Yes" : <span className="font-semibold text-warning">No verified group yet. Assign a mobiliser.</span>}</td>
                  </tr>
                ) : (
                  <tr key={r.code}>
                    <td>{r.name}</td>
                    <td className="num text-[13px] text-ink-muted">{r.code}</td>
                    <td className={`num text-right ${r.volunteers ? "" : "font-semibold text-danger"}`}>{fmt(r.volunteers)}</td>
                    <td className="num text-right">{r.agents ? fmt(r.agents) : <span className="text-ink-muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="t-help mt-2">{fmt(shownGaps.length)} shown</p>
        </>
      )}
    </>
  );
}

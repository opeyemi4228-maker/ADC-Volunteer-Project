import Link from "next/link";
import { CalendarCheck, AlertTriangle, Plus, MapPin } from "lucide-react";

import { requireViewer } from "@/lib/guard";
import { all } from "@/lib/db";
import { scopeSql } from "@/lib/scope";
import { placeLabel } from "@/lib/geo";
import { ACTIVITY_TYPES, VOTER_CONCERNS, labelOf } from "@/lib/options";
import { Alert, Card, EmptyState, Stat, fmt, dateLabel } from "@/components/ui";
import { PageHeader, FilterBar, FilterSelect } from "@/components/workspace/ui";
import BarList from "@/components/workspace/charts/BarList";

export const metadata = { title: "Activities" };

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export default async function ActivitiesPage({ searchParams }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const days = Number(sp.days) || 30;
  const s = scopeSql(viewer, "activity", "a");
  const rows = all(
    `SELECT a.*, g.name AS group_name, (SELECT COUNT(*) FROM media_items m WHERE m.owner_type = 'activity' AND m.owner_id = a.id) AS media
     FROM activities a LEFT JOIN support_groups g ON g.id = a.group_id
     WHERE ${s.sql} AND a.date >= date('now', :since) AND (:type = '' OR a.type = :type) AND (:inc = '' OR a.incident_type != 'none')
     ORDER BY a.date DESC, a.created_at DESC LIMIT 200`,
    { ...s.params, since: `-${days} days`, type: sp.type ?? "", inc: sp.incidents ? "1" : "" },
  );
  const concerns = new Map();
  for (const r of rows) for (const c of JSON.parse(r.concerns ?? "[]")) concerns.set(c, (concerns.get(c) ?? 0) + 1);
  const sum = (k) => rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  const incidents = rows.filter((r) => r.incident_type && r.incident_type !== "none");

  return (
    <>
      <PageHeader
        title="Activities"
        description="What groups are doing on the ground, and what voters are telling them."
        actions={viewer.powers.includes("log_activity") && <Link href="/workspace/activities/new" className="btn btn-primary btn-sm"><Plus aria-hidden className="size-4" /> Report an activity</Link>}
      />
      {sp.reported && <Alert tone="success" title={`Activity ${sp.reported} reported`} className="mb-4">Thank you. Photos and videos go to the moderation queue before they appear in galleries.</Alert>}

      <FilterBar action="/workspace/activities" reset="/workspace/activities">
        <FilterSelect name="days" label="Period" value={String(days)} options={RANGES} all="Last 30 days" />
        <FilterSelect name="type" label="Type" value={sp.type} options={ACTIVITY_TYPES} />
        <label className="flex min-h-10 items-center gap-2 text-[14px] font-medium">
          <input type="checkbox" name="incidents" value="1" defaultChecked={Boolean(sp.incidents)} className="size-5 accent-brand-700" /> Only with incidents
        </label>
      </FilterBar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Activities" value={fmt(rows.length)} />
        <Stat label="People reached" value={fmt(sum("attendance"))} />
        <Stat label="Households visited" value={fmt(sum("households_reached"))} />
        <Stat label="New volunteers" value={fmt(sum("new_signups"))} />
        <Stat label="Incidents" value={fmt(incidents.length)} tone={incidents.length ? "warn" : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div>
          {rows.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No activities in this period">When groups report meetings and outreaches they appear here.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {rows.map((a) => (
                <li key={a.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{a.title ?? labelOf(ACTIVITY_TYPES, a.type)} <span className="text-[14px] font-normal text-ink-muted">· {labelOf(ACTIVITY_TYPES, a.type)}</span></p>
                      <p className="text-[14px] text-ink-muted">{dateLabel(a.date)}</p>
                    </div>
                    <p className="mt-0.5 text-[14px] text-ink-muted">
                      {a.group_name ? <Link className="link" href={`/workspace/groups/${a.group_id}?tab=activities`}>{a.group_name}</Link> : "No group"} · <MapPin aria-hidden className="inline size-3.5" /> {placeLabel(a)}
                    </p>
                    <p className="mt-2 text-[14px] num">
                      {a.attendance != null && <>Attendance {fmt(a.attendance)} · </>}
                      {a.households_reached != null && <>{fmt(a.households_reached)} households · </>}
                      {fmt(a.new_signups ?? 0)} new volunteers{a.media ? ` · ${a.media} photos/videos` : ""}
                    </p>
                    {JSON.parse(a.concerns ?? "[]").length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {JSON.parse(a.concerns).map((c) => <span key={c} className="rounded-full bg-surface-alt px-2.5 py-0.5 text-[12px] font-semibold">{labelOf(VOTER_CONCERNS, c)}</span>)}
                      </div>
                    )}
                    {a.incident_type && a.incident_type !== "none" && (
                      <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-[14px] text-danger"><AlertTriangle aria-hidden className="mr-1 inline size-4" />Incident: {a.incident_type.replace("_", " ")}. <span className="text-ink">{a.incident_details}</span></p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card className="h-fit p-5">
          <h2 className="h-section">Top concerns raised by voters</h2>
          <p className="t-help mt-0.5">Share of activities where each came up.</p>
          <div className="mt-4">
            {concerns.size ? (
              <BarList total={rows.length} items={[...concerns].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: labelOf(VOTER_CONCERNS, k), value: n }))} />
            ) : <p className="text-ink-muted">No concerns reported yet.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}

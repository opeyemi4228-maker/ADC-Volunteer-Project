import Link from "next/link";
import { Images, Users } from "lucide-react";

import { requireViewer } from "@/lib/guard";
import { isSuperAdmin } from "@/lib/scope";
import { ZONES, areaName, childAreas, statesInZone, stateList } from "@/lib/geo";
import { visibleTasks } from "@/lib/tasks";
import { EmptyState, StatusBadge, cx, fmt, dateLabel, timeAgo } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import { ApiButton } from "@/components/workspace/actions";
import { Meter } from "@/components/workspace/charts/Dash";
import NewTask from "./NewTask";

export const metadata = { title: "Tasks" };

/** Where the viewer may aim a task: anywhere for the Super Admin, inside their own area for a coordinator. */
function areaOptions(viewer) {
  if (isSuperAdmin(viewer)) {
    return [
      { value: "NG", label: "Nationwide" },
      ...Object.entries(ZONES).map(([value, label]) => ({ value, label: `${label} (zone)` })),
      ...stateList.map((s) => ({ value: s.code, label: s.name })),
    ];
  }
  const out = [];
  for (const r of viewer.roles) {
    if (r.role === "zonal_coordinator") out.push(...statesInZone(r.area_code).map((c) => ({ value: c, label: areaName(c) })));
    if (["state_coordinator", "lga_coordinator", "ward_coordinator"].includes(r.role)) {
      out.push({ value: r.area_code, label: `${areaName(r.area_code)} (all)` });
      for (const c of childAreas(r.area_type, r.area_code).filter((x) => x.type !== "pu")) out.push({ value: c.code, label: `${areaName(r.area_code)} › ${c.name}` });
    }
  }
  return out;
}

export default async function TasksPage() {
  const viewer = await requireViewer();
  const tasks = await visibleTasks(viewer);
  const canAssign = viewer.powers.includes("assign_tasks");
  const open = tasks.filter((t) => t.status === "open");
  const closed = tasks.filter((t) => t.status !== "open");
  const reports = tasks.reduce((n, t) => n + t.reports, 0);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Work for volunteers: set it for an area, and every volunteer there sees it on their dashboard and reports progress, with photos."
      />
      {canAssign && <NewTask areas={areaOptions(viewer)} />}
      {tasks.length > 0 && (
        <p className="mb-4 text-[14px] text-ink-muted num">{fmt(open.length)} open · {fmt(closed.length)} closed · {fmt(reports)} progress reports from volunteers</p>
      )}
      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet">{canAssign ? "Create a task above. Volunteers in the area see it straight away." : "Tasks set for your area will appear here."}</EmptyState>
      ) : (
        <div className="space-y-8">
          {[["Open", open], ["Closed", closed]].map(([label, list]) => list.length > 0 && (
            <section key={label} aria-label={`${label} tasks`}>
              <h2 className="h-section mb-3">{label} <span className="text-ink-muted num">({list.length})</span></h2>
              <ul className="grid gap-4 xl:grid-cols-2">
                {list.map((t) => <TaskCard key={t.id} t={t} canClose={isSuperAdmin(viewer) || t.created_by === viewer.id} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function TaskCard({ t, canClose }) {
  const late = t.status === "open" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
  return (
    <li className="card flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[17px] font-bold leading-6">{t.title}</p>
        {t.status === "open"
          ? <span className={cx("rounded-full px-2.5 py-0.5 text-[13px] font-semibold", late ? "bg-danger-bg text-danger" : "bg-surface-alt")}>{late ? "Overdue · " : "Due "}{dateLabel(t.due_date)}</span>
          : <StatusBadge status={t.status === "done" ? "done" : "cancelled"} />}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[14px] text-ink-muted">
        <span>{t.audience}</span>
        <span className="inline-flex items-center gap-1 num"><Users aria-hidden className="size-3.5" /> {fmt(t.reach)} reached</span>
      </p>
      {t.description && <p className="mt-2 text-[15px]">{t.description}</p>}
      {t.target_value ? (
        <div className="mt-3">
          <div className="flex justify-between text-[14px] num"><span><strong>{fmt(t.achieved)}</strong> of {fmt(t.target_value)} {t.target_unit}</span><span>{Math.min(100, Math.round((t.achieved / t.target_value) * 100))}%</span></div>
          <Meter className="mt-1.5" value={t.achieved} max={t.target_value} label={`${t.title} progress`} />
        </div>
      ) : (
        <p className="mt-3 text-[14px] num"><strong>{fmt(t.achieved)}</strong> {t.target_unit ?? "done"} reported so far</p>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-[13px] font-semibold text-ink-muted num">
          {t.reports ? `${fmt(t.volunteers)} ${t.volunteers === 1 ? "volunteer" : "volunteers"} · ${fmt(t.reports)} ${t.reports === 1 ? "report" : "reports"}` : "No reports yet"}
        </p>
        {t.recent.length > 0 && (
          <ul className="mt-2 space-y-2">
            {t.recent.map((r) => (
              <li key={r.id} className="text-[14px] leading-5">
                {r.volunteer_id
                  ? <Link href={`/workspace/volunteers/${r.volunteer_id}`} className="font-semibold text-brand-800 hover:underline">{r.reporter_name}</Link>
                  : <span className="font-semibold">{r.reporter_name}</span>}
                {" "}reported <span className="font-semibold num">{fmt(r.achieved_value)}</span>{t.target_unit ? ` ${t.target_unit}` : ""}
                {r.media > 0 && <span className="ml-1 inline-flex items-center gap-0.5 text-ink-muted"><Images aria-hidden className="size-3.5" />{r.media}</span>}
                <span className="text-ink-muted"> · {timeAgo(r.created_at)}</span>
                {r.notes && <span className="block text-[13px] text-ink-muted">“{r.notes}”</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-[12px] text-ink-muted">
        <span>{t.areaName} · set by {t.creator_name ?? "Super Admin"}</span>
        {canClose && (t.status === "open"
          ? <ApiButton url={`/api/v1/tasks/${t.id}`} method="PATCH" data={{ status: "done" }} className="btn btn-ghost btn-sm" doneLabel="Closed" confirm="Close this task? Volunteers can no longer report on it.">Close task</ApiButton>
          : <ApiButton url={`/api/v1/tasks/${t.id}`} method="PATCH" data={{ status: "open" }} className="btn btn-ghost btn-sm" doneLabel="Reopened">Reopen</ApiButton>)}
      </div>
    </li>
  );
}

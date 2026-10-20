import Link from "next/link";
import { ListTodo } from "lucide-react";

import { getViewer } from "@/lib/auth";
import { all } from "@/lib/db";
import { scopeSql } from "@/lib/scope";
import { areaName, childAreas, statesInZone, stateList } from "@/lib/geo";
import { visibleTasks } from "@/lib/tasks";
import { Card, EmptyState, StatusBadge, fmt, dateLabel } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import TaskReportForm from "@/components/workspace/TaskReportForm";
import NewTask from "./NewTask";

export const metadata = { title: "Tasks" };

function areaOptions(viewer) {
  const out = [];
  for (const r of viewer.roles) {
    if (r.role === "national_admin") out.push(...stateList.map((s) => ({ value: s.code, label: s.name })));
    if (r.role === "zonal_coordinator") out.push(...statesInZone(r.area_code).map((c) => ({ value: c, label: areaName(c) })));
    if (["state_coordinator", "lga_coordinator", "ward_coordinator"].includes(r.role)) {
      out.push({ value: r.area_code, label: `${areaName(r.area_code)} (all)` });
      for (const c of childAreas(r.area_type, r.area_code).filter((c) => c.type !== "pu")) out.push({ value: c.code, label: `${areaName(r.area_code)} › ${c.name}` });
    }
  }
  return out;
}

export default async function TasksPage() {
  const viewer = await getViewer();
  const tasks = visibleTasks(viewer);
  const canAssign = viewer.powers.includes("assign_tasks");
  const s = scopeSql(viewer, "group", "g");
  const groups = canAssign ? all(`SELECT g.id, g.name, g.lga_code, g.ward_code FROM support_groups g WHERE g.status = 'verified' AND ${s.sql} ORDER BY g.name LIMIT 500`, s.params).map((g) => ({ id: g.id, name: g.name, place: areaName(g.ward_code ?? g.lga_code) })) : [];
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status !== "open");

  return (
    <>
      <PageHeader title="Tasks" description="Work assigned to groups and areas, with a target and progress reports." />
      {canAssign && <NewTask areas={areaOptions(viewer)} groups={groups} />}
      {tasks.length === 0 ? (
        <EmptyState icon={ListTodo} title="No tasks yet">{canAssign ? "Create a task above and assign it to the groups in an area." : "Tasks your coordinators assign will appear here."}</EmptyState>
      ) : (
        <div className="space-y-8">
          {[["Open", open], ["Completed", done]].map(([label, list]) => list.length > 0 && (
            <section key={label}>
              <h2 className="h-section mb-3">{label} <span className="text-ink-muted num">({list.length})</span></h2>
              <ul className="grid gap-4 lg:grid-cols-2">
                {list.map((t) => {
                  const late = t.status === "open" && t.due_date < new Date().toISOString().slice(0, 10);
                  const pct = t.target_value ? Math.min(100, Math.round((t.achieved / t.target_value) * 100)) : null;
                  return (
                    <li key={t.id}>
                      <Card className="h-full p-5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-[17px] font-bold">{t.title}</p>
                          {t.status === "open" ? <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${late ? "bg-danger-bg text-danger" : "bg-surface-alt"}`}>{late ? "Overdue · " : "Due "}{dateLabel(t.due_date)}</span> : <StatusBadge status="done" />}
                        </div>
                        <p className="mt-1 text-[14px] text-ink-muted">{t.areaName} · set by {t.creator_name}</p>
                        {t.description && <p className="mt-2 text-[15px]">{t.description}</p>}
                        {pct != null && (
                          <div className="mt-3">
                            <div className="flex justify-between text-[14px] num"><span><strong>{fmt(t.achieved)}</strong> of {fmt(t.target_value)} {t.target_unit}</span><span>{pct}%</span></div>
                            <div className="mt-1 h-2 rounded-full bg-surface-alt" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
                          </div>
                        )}
                        {t.groups.length > 0 && (
                          <p className="mt-3 text-[13px] text-ink-muted">
                            Assigned to {t.groups.slice(0, 4).map((g, i) => <span key={g.id}>{i > 0 && ", "}<Link className="link" href={`/workspace/groups/${g.id}?tab=tasks`}>{g.name}</Link></span>)}
                            {t.groups.length > 4 && ` and ${t.groups.length - 4} more`}
                          </p>
                        )}
                        {t.status === "open" && (t.mine || canAssign) && <TaskReportForm taskId={t.id} unit={t.target_unit} />}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

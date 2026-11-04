import { CalendarDays, CheckCircle2, ListTodo, MapPin, Users } from "lucide-react";

import { requireVolunteer } from "@/lib/guard";
import { volunteerContext, tasksFor } from "@/lib/volunteer-portal";
import { VOLUNTEER_ROLES, labelOf } from "@/lib/options";
import { Alert, EmptyState, StatusBadge, cx, dateLabel, fmt } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import { Meter } from "@/components/workspace/charts/Dash";
import VolunteerReport from "@/components/workspace/VolunteerReport";

export const metadata = { title: "My tasks" };

/** Every task the supervising body set that reaches this volunteer, with their own progress. */
export default async function MyTasks() {
  const { volunteerId } = await requireVolunteer();
  const v = await volunteerContext(volunteerId);
  const tasks = await tasksFor(v);
  const open = tasks.filter((t) => t.status === "open");
  const closed = tasks.filter((t) => t.status !== "open");

  return (
    <>
      <PageHeader title="My tasks" description="Work the Super Admin has set for volunteers in your area. Report what you did, with photos if you have them." />
      {!v.canReport && (
        <Alert tone="info" className="mb-5" title="You can report once you are verified">
          Your registration is being checked. Until then you can read the tasks for your area.
        </Alert>
      )}
      {tasks.length === 0 ? (
        <EmptyState icon={ListTodo} title="No tasks yet">When the Super Admin sets a task for your area, it appears here and on your dashboard.</EmptyState>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="open-tasks">
            <h2 id="open-tasks" className="h-section mb-3">Open <span className="text-ink-muted num">({fmt(open.length)})</span></h2>
            {open.length === 0 ? <p className="text-[15px] text-ink-muted">Nothing open right now.</p> : (
              <ul className="space-y-3">{open.map((t) => <TaskCard key={t.id} t={t} canReport={v.canReport} />)}</ul>
            )}
          </section>
          {closed.length > 0 && (
            <section aria-labelledby="done-tasks">
              <h2 id="done-tasks" className="h-section mb-3">Finished</h2>
              <ul className="space-y-3">{closed.map((t) => <TaskCard key={t.id} t={t} />)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function TaskCard({ t, canReport }) {
  const overdue = t.status === "open" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold leading-6">{t.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
            <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="size-3.5" /> {t.areaName}</span>
            {t.due_date && <span className={cx("inline-flex items-center gap-1", overdue && "font-semibold text-warning")}><CalendarDays aria-hidden className="size-3.5" /> Due {dateLabel(t.due_date)}</span>}
            {t.role && <span className="inline-flex items-center gap-1"><Users aria-hidden className="size-3.5" /> {labelOf(VOLUNTEER_ROLES, t.role)}s</span>}
          </p>
        </div>
        {t.status === "open"
          ? t.lastReport ? <StatusBadge status="sent" label="You reported" /> : <StatusBadge status="open" label="Waiting for your report" />
          : <StatusBadge status={t.status === "done" ? "done" : "cancelled"} />}
      </div>
      {t.description && <p className="mt-3 whitespace-pre-line text-[15px]">{t.description}</p>}
      {t.target_value ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="font-medium">Everyone together</span>
            <span className="text-ink-muted num"><span className="font-semibold text-ink">{fmt(t.achieved)}</span> of {fmt(t.target_value)} {t.target_unit ?? ""}</span>
          </div>
          <Meter className="mt-1.5" value={t.achieved} max={t.target_value} label={`${t.title} progress`} />
        </div>
      ) : null}
      <p className="mt-3 text-[13px] text-ink-muted">
        {t.mine > 0 ? <><CheckCircle2 aria-hidden className="mr-1 inline size-3.5 text-success" />You have reported <span className="font-semibold text-ink num">{fmt(t.mine)}</span>{t.target_unit ? ` ${t.target_unit}` : ""}, last on {dateLabel(t.lastReport)}. </> : null}
        {fmt(t.volunteers)} {t.volunteers === 1 ? "volunteer has" : "volunteers have"} reported so far.
      </p>
      {canReport && t.status === "open" && <VolunteerReport taskId={t.id} unit={t.target_unit} reported={Boolean(t.lastReport)} />}
    </li>
  );
}

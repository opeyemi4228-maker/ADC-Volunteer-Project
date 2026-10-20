import { run } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { visibleTasks } from "@/lib/tasks";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/** POST /api/v1/tasks/{id}/report { achieved, notes } */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("workspace");
  if (denied) return denied;
  const { id } = await params;
  const task = visibleTasks(viewer).find((t) => t.id === id);
  if (!task) return fail(404, "Task not found.");
  if (!task.mine && !viewer.powers.includes("assign_tasks")) return fail(403, "Only assigned groups can report on this task.");
  const { achieved, notes } = await body(request);
  if (!(Number(achieved) >= 0)) return fail(422, "Enter a number.");
  run("INSERT INTO task_reports (id, task_id, achieved_value, notes, reported_by, reporter_name) VALUES (:id, :t, :v, :n, :by, :name)", {
    id: uuid(), t: id, v: Math.round(Number(achieved)), n: String(notes ?? "").slice(0, 300) || null, by: viewer.id, name: viewer.name,
  });
  if (task.target_value && task.achieved + Number(achieved) >= task.target_value) run("UPDATE tasks SET status = 'done' WHERE id = :id", { id });
  audit(viewer, "task_reported", "task", id, { achieved }, await clientIp());
  return ok({ ok: true });
}

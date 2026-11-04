import { clientIp } from "@/lib/auth";
import { setTaskStatus } from "@/lib/tasks";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/** PATCH /api/v1/tasks/{id} { status: open|done|cancelled }: the Super Admin closes or reopens a task. */
export async function PATCH(request, { params }) {
  const { viewer, denied } = await requirePower("assign_tasks");
  if (denied) return denied;
  const { id } = await params;
  const { status } = await body(request);
  if (!(await setTaskStatus(viewer, id, status))) return fail(404, "Task not found, or unknown status.");
  await audit(viewer, `task_${status}`, "task", id, null, await clientIp());
  return ok({ ok: true });
}

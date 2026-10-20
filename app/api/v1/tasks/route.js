import { clientIp } from "@/lib/auth";
import { visibleTasks, createTask } from "@/lib/tasks";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

export async function GET() {
  const { viewer, denied } = await requirePower("workspace");
  if (denied) return denied;
  return ok({ tasks: visibleTasks(viewer) });
}

export async function POST(request) {
  const { viewer, denied } = await requirePower("assign_tasks");
  if (denied) return denied;
  const r = await createTask(viewer, await body(request));
  if (r.errors) return fail(422, "Some answers need attention.", { errors: r.errors });
  audit(viewer, "task_created", "task", r.id, { assigned: r.assigned }, await clientIp());
  return ok(r);
}

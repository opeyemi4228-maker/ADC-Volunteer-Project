import { run, scalar, tx } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { volunteerContext, taskFor } from "@/lib/volunteer-portal";
import { attachMedia } from "@/lib/registration";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/tasks/{id}/report { achieved, notes, media? }
 * A volunteer reports their progress on a task that reaches them, with
 * optional photos. The task closes itself once everyone's reports together
 * reach its target. Only verified volunteers can report.
 */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("volunteer");
  if (denied) return denied;
  const { id } = await params;
  const own = viewer.roles.find((r) => r.role === "volunteer");
  const v = await volunteerContext(own.area_code);
  if (!v) return fail(404, "Volunteer record not found.");
  if (!v.canReport) return fail(403, "You can report on tasks once the Super Admin has verified your registration.");
  const task = await taskFor(v, id);
  if (!task) return fail(404, "This task is not one of yours.");
  if (task.status !== "open") return fail(409, "This task is closed.");
  const { achieved, notes, media } = await body(request);
  const value = Number(achieved);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return fail(422, "Enter a number.");
  if ((media ?? []).some((m) => !m.consent)) return fail(422, "Confirm consent for every photo and video, or remove it.");

  const reportId = uuid();
  const out = await tx(async () => {
    await run(
      "INSERT INTO task_reports (id, task_id, achieved_value, notes, reported_by, reporter_name, volunteer_id) VALUES (:id, :t, :v, :n, :by, :name, :vol)",
      { id: reportId, t: id, v: Math.round(value), n: String(notes ?? "").trim().slice(0, 300) || null, by: viewer.id, name: v.name, vol: v.id },
    );
    const attached = await attachMedia(
      (media ?? []).map((m) => ({ ...m, event_name: task.title, event_date: new Date().toISOString().slice(0, 10), state: v.vote_state_code, lga: v.vote_lga_code, ward: v.vote_ward_code })),
      { ownerType: "task_report", ownerId: reportId, groupId: v.group_id, uploadedBy: `user:${viewer.id}`, uploaderName: v.name, volunteerId: v.id },
    );
    const total = await scalar("SELECT COALESCE(SUM(achieved_value), 0) FROM task_reports WHERE task_id = :t", { t: id });
    if (task.target_value && total >= task.target_value) await run("UPDATE tasks SET status = 'done' WHERE id = :id AND status = 'open'", { id });
    return { total, media: attached.length };
  });
  await audit(viewer, "task_reported", "task", id, { achieved: Math.round(value), report: reportId, volunteer: v.public_id }, await clientIp());
  return ok({ ok: true, ...out });
}

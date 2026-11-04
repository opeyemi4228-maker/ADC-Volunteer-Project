import { one, run, nowIso } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * PATCH /api/v1/activities/{id} { status: approved|rejected|submitted, note }
 * The Super Admin's review of a reported activity. A rejection needs a note,
 * which the volunteer sees on their own activity list.
 */
export async function PATCH(request, { params }) {
  const { viewer, denied } = await requirePower("moderate_media");
  if (denied) return denied;
  const { id } = await params;
  const { status, note } = await body(request);
  if (!["approved", "rejected", "submitted"].includes(status)) return fail(422, "Unknown status.");
  const text = String(note ?? "").trim().slice(0, 300);
  if (status === "rejected" && !text) return fail(422, "Say why. The volunteer will see it.");
  const a = await one("SELECT id FROM activities WHERE id = :id", { id });
  if (!a) return fail(404, "Activity not found.");
  await run("UPDATE activities SET review_status = :s, review_note = :n, reviewed_by = :u, reviewed_at = :now WHERE id = :id", {
    s: status, n: text || null, u: viewer.id, now: nowIso(), id,
  });
  await audit(viewer, `activity_${status}`, "activity", id, text ? { note: text } : null, await clientIp());
  return ok({ ok: true });
}

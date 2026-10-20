import { one, run, nowIso } from "@/lib/db";
import { open } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { scopeSql } from "@/lib/scope";
import { send } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/** PATCH /api/v1/media/{id}/moderate { status: approved|publicity|rejected|pending, reason } */
export async function PATCH(request, { params }) {
  const { viewer, denied } = await requirePower("moderate_media");
  if (denied) return denied;
  const { id } = await params;
  const { status, reason } = await body(request);
  if (!["approved", "publicity", "rejected", "pending"].includes(status)) return fail(422, "Unknown status.");
  if (status === "publicity" && !viewer.powers.includes("publicity")) return fail(403, "Only the media directorate can clear media for publicity.");
  if (status === "rejected" && !String(reason ?? "").trim()) return fail(422, "Give a reason. The uploader will see it.");
  const s = scopeSql(viewer, "media");
  const m = one(`SELECT * FROM media_items WHERE id = :mid AND ${s.sql}`, { mid: id, ...s.params });
  if (!m) return fail(404, "Not found in your area.");
  run("UPDATE media_items SET moderation_status = :s, moderated_by = :u, moderated_at = :now, rejection_reason = :r WHERE id = :id", {
    s: status, u: viewer.id, now: nowIso(), r: status === "rejected" ? String(reason).slice(0, 200) : null, id,
  });
  if (status === "rejected" && m.group_id) {
    const leader = one("SELECT phone_enc FROM group_leaders WHERE group_id = :g AND position = 'coordinator' LIMIT 1", { g: m.group_id });
    if (leader) await send({ channel: "whatsapp", to: open(leader.phone_enc), template: "media_rejected", vars: { reason: String(reason).slice(0, 80) } });
  }
  audit(viewer, `media_${status}`, "media", id, { reason }, await clientIp());
  return ok({ ok: true });
}

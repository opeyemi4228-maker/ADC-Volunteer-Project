import { run } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/** POST { action: "revoke", roleId } | { action: "deactivate" } | { action: "activate" } */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("manage_users");
  if (denied) return denied;
  const { id } = await params;
  const d = await body(request);
  if (id === viewer.id && d.action !== "activate") return fail(422, "You can't change your own access.");
  if (d.action === "revoke") run("DELETE FROM role_assignments WHERE id = :r AND user_id = :u", { r: d.roleId, u: id });
  else if (d.action === "deactivate") { run("UPDATE users SET active = 0 WHERE id = :u", { u: id }); run("DELETE FROM sessions WHERE user_id = :u", { u: id }); }
  else if (d.action === "activate") run("UPDATE users SET active = 1 WHERE id = :u", { u: id });
  else return fail(400, "Unknown action.");
  audit(viewer, `user_${d.action}`, "user", id, { roleId: d.roleId }, await clientIp());
  return ok({ ok: true });
}

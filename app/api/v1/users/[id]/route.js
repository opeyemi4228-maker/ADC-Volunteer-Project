import { run, scalar } from "@/lib/db";
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
  // The supervising body must never lock itself out.
  // Only matters when the change removes a Super Admin: deactivating one, or revoking their Super Admin role.
  const SUPER = "r.role IN ('super_admin', 'national_admin')";
  const touchesSuper = d.action === "deactivate"
    ? await scalar(`SELECT COUNT(*) FROM role_assignments r WHERE r.user_id = :u AND ${SUPER}`, { u: id })
    : d.action === "revoke" ? await scalar(`SELECT COUNT(*) FROM role_assignments r WHERE r.id = :r AND ${SUPER}`, { r: d.roleId }) : 0;
  if (touchesSuper) {
    const left = await scalar(
      `SELECT COUNT(DISTINCT u.id) FROM users u JOIN role_assignments r ON r.user_id = u.id
       WHERE ${SUPER} AND u.active = 1 AND u.id <> :u`,
      { u: id },
    );
    if (left === 0) return fail(422, "This is the last active Super Admin account.");
  }
  if (d.action === "revoke") await run("DELETE FROM role_assignments WHERE id = :r AND user_id = :u", { r: d.roleId, u: id });
  else if (d.action === "deactivate") { await run("UPDATE users SET active = 0 WHERE id = :u", { u: id }); await run("DELETE FROM sessions WHERE user_id = :u", { u: id }); }
  else if (d.action === "activate") await run("UPDATE users SET active = 1 WHERE id = :u", { u: id });
  else return fail(400, "Unknown action.");
  await audit(viewer, `user_${d.action}`, "user", id, { roleId: d.roleId }, await clientIp());
  return ok({ ok: true });
}

import { one, run, tx } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/volunteers/{id}/account { action: suspend|restore, reason }
 * The Super Admin stops or restores a volunteer's sign-in. Suspending ends
 * every session at once; the volunteer's record and history are untouched.
 */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("manage_volunteers");
  if (denied) return denied;
  const { id } = await params;
  const { action, reason } = await body(request);
  if (!["suspend", "restore"].includes(action)) return fail(422, "Unknown action.");
  if (action === "suspend" && String(reason ?? "").trim().length < 3) return fail(422, "Give a reason for the audit log.");
  const acct = await one(
    `SELECT u.id FROM users u JOIN role_assignments r ON r.user_id = u.id JOIN volunteers v ON v.id = r.area_code
     WHERE r.role = 'volunteer' AND (v.id = :id OR v.public_id = :id) LIMIT 1`,
    { id },
  );
  if (!acct) return fail(404, "This volunteer has no sign-in account.");
  await tx(async () => {
    await run("UPDATE users SET active = :a WHERE id = :u", { a: action === "restore" ? 1 : 0, u: acct.id });
    if (action === "suspend") await run("DELETE FROM sessions WHERE user_id = :u", { u: acct.id });
  });
  await audit(viewer, `volunteer_account_${action === "suspend" ? "suspended" : "restored"}`, "volunteer", id, { reason: String(reason ?? "").trim().slice(0, 200) || undefined }, await clientIp());
  return ok({ ok: true });
}

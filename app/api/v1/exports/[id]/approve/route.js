import { one, run } from "@/lib/db";
import { token } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/** POST { decision: approve|reject }: national admin only; approval makes a 24-hour link. */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("approve_export");
  if (denied) return denied;
  const { id } = await params;
  const e = one("SELECT * FROM exports WHERE id = :id AND status = 'awaiting_approval'", { id });
  if (!e) return fail(404, "This export is not waiting for approval.");
  if (e.requested_by === viewer.id) return fail(403, "Someone else must approve your own export request.");
  const { decision } = await body(request);
  if (decision === "reject") {
    run("UPDATE exports SET status = 'rejected', approved_by = :u, approver_name = :n WHERE id = :id", { u: viewer.id, n: viewer.name, id });
  } else {
    const exp = new Date(Date.now() + 24 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
    run("UPDATE exports SET status = 'approved', approved_by = :u, approver_name = :n, token = :t, expires_at = :exp WHERE id = :id", { u: viewer.id, n: viewer.name, t: token(24), exp, id });
  }
  audit(viewer, `export_${decision === "reject" ? "rejected" : "approved"}`, "export", id, null, await clientIp());
  return ok({ ok: true });
}

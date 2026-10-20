import { clientIp } from "@/lib/auth";
import { run } from "@/lib/db";
import { approveMessage } from "@/lib/messages";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("approve_messages");
  if (denied) return denied;
  const { id } = await params;
  const { decision } = await body(request);
  if (decision === "cancel") {
    run("UPDATE messages SET status = 'cancelled', approved_by = :u, approver_name = :n WHERE id = :id AND status = 'awaiting_approval'", { u: viewer.id, n: viewer.name, id });
    audit(viewer, "message_cancelled", "message", id, null, await clientIp());
    return ok({ ok: true });
  }
  const r = await approveMessage(viewer, id);
  if (r.error) return fail(422, r.error);
  audit(viewer, "message_approved", "message", id, null, await clientIp());
  return ok(r);
}

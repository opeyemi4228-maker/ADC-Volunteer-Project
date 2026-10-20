import { clientIp } from "@/lib/auth";
import { createMessage } from "@/lib/messages";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

export async function POST(request) {
  const { viewer, denied } = await requirePower("message");
  if (denied) return denied;
  const r = await createMessage(viewer, await body(request));
  if (r.error) return fail(422, r.error);
  audit(viewer, "message_campaign", "message", r.id, { recipients: r.count, cost: r.cost, status: r.status }, await clientIp());
  return ok(r);
}

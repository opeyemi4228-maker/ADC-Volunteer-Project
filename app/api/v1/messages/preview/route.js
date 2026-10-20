import { preview } from "@/lib/messages";
import { ok, body, requirePower } from "@/lib/http";

/** POST /api/v1/messages/preview { channel, body, audience } -> { count, segments, cost, needsApproval } */
export async function POST(request) {
  const { viewer, denied } = await requirePower("message");
  if (denied) return denied;
  const d = await body(request);
  return ok(preview(viewer, d.audience ?? {}, String(d.body ?? ""), d.channel ?? "sms"));
}

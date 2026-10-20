import { clientIp } from "@/lib/auth";
import { decideGroup } from "@/lib/verify";
import { ok, fail, body, requirePower } from "@/lib/http";

/** POST /api/v1/groups/{id}/{verify|reject|request-info|suspend|reinstate|resolve-flag} */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("workspace");
  if (denied) return denied;
  const { id, action } = await params;
  const r = await decideGroup(viewer, id, action, await body(request), await clientIp());
  return r.ok ? ok(r) : fail(r.status, r.error);
}

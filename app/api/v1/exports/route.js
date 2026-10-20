import { run } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { coversArea } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/** POST /api/v1/exports { kind: volunteers|groups, area, reason }: a request, never a download. */
export async function POST(request) {
  const { viewer, denied } = await requirePower("request_export");
  if (denied) return denied;
  const { kind, area, reason } = await body(request);
  if (!["volunteers", "groups"].includes(kind)) return fail(422, "Choose what to export.");
  if (!area || !coversArea(viewer, area)) return fail(422, "Choose an area you coordinate.");
  if (String(reason ?? "").trim().length < 10) return fail(422, "Say why you need this export (at least a sentence).");
  const id = uuid();
  run("INSERT INTO exports (id, kind, filters, reason, requested_by, requester_name) VALUES (:id, :k, :f, :r, :u, :n)", {
    id, k: kind, f: JSON.stringify({ area }), r: String(reason).trim().slice(0, 500), u: viewer.id, n: viewer.name,
  });
  audit(viewer, "export_requested", "export", id, { kind, area }, await clientIp());
  return ok({ id });
}

import { one, run, nowIso } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { coversArea } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { ok, fail, requirePower } from "@/lib/http";

/** POST /api/v1/election/results/{pu}/confirm: second check against the sheet photo. */
export async function POST(_request, { params }) {
  const { viewer, denied } = await requirePower("election");
  if (denied) return denied;
  const { pu } = await params;
  if (!coversArea(viewer, pu.slice(0, 10))) return fail(403, "That polling unit is outside your area.");
  const r = one("SELECT * FROM results WHERE pu_code = :pu", { pu });
  if (!r) return fail(404, "No result for this polling unit yet.");
  run("UPDATE results SET confirmed_by = :u, confirmed_at = :now WHERE pu_code = :pu", { u: viewer.id, now: nowIso(), pu });
  audit(viewer, "result_confirmed", "pu", pu, null, await clientIp());
  return ok({ ok: true });
}

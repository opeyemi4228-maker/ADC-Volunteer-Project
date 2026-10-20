import { run } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { coversArea } from "@/lib/scope";
import { assignAgent } from "@/lib/election";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/election/agents
 *   { action: "assign", pu, volunteerId, backup }
 *   { action: "unassign", pu, backup }
 *   { action: "accreditation", pu, backup, status }
 */
export async function POST(request) {
  const { viewer, denied } = await requirePower("assign_agents");
  if (denied) return denied;
  const d = await body(request);
  if (!d.pu || !coversArea(viewer, String(d.pu).slice(0, 10))) return fail(403, "That polling unit is outside your area.");
  if (d.action === "assign") {
    const r = assignAgent(viewer, d);
    if (r.error) return fail(422, r.error);
  } else if (d.action === "unassign") {
    run("DELETE FROM pu_agents WHERE pu_code = :pu AND is_backup = :b", { pu: d.pu, b: d.backup ? 1 : 0 });
  } else if (d.action === "accreditation") {
    if (!["not_started", "submitted", "accredited", "refused"].includes(d.status)) return fail(422, "Unknown status.");
    run("UPDATE pu_agents SET accreditation_status = :s WHERE pu_code = :pu AND is_backup = :b", { s: d.status, pu: d.pu, b: d.backup ? 1 : 0 });
  } else return fail(400, "Unknown action.");
  audit(viewer, `agent_${d.action}`, "pu", d.pu, { backup: Boolean(d.backup), status: d.status, volunteer: d.volunteerId }, await clientIp());
  return ok({ ok: true });
}

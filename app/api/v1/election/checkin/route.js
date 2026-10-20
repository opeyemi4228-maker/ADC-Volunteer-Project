import { run, nowIso } from "@/lib/db";
import { getRegistrant } from "@/lib/auth";
import { agentFor, isLive } from "@/lib/election";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/http";

/** POST /api/v1/election/checkin: the agent has arrived at their polling unit. */
export async function POST() {
  const reg = await getRegistrant();
  if (!reg) return fail(401, "Verify your phone number first.");
  if (!isLive()) return fail(409, "Check-in opens on election day.");
  const a = agentFor(reg.phoneHash)?.assignment;
  if (!a) return fail(404, "You are not assigned to a polling unit.");
  run("UPDATE pu_agents SET checked_in_at = COALESCE(checked_in_at, :now) WHERE pu_code = :pu AND volunteer_id = :v", { now: nowIso(), pu: a.pu_code, v: a.volunteer_id });
  audit({ name: "PU agent" }, "agent_checkin", "pu", a.pu_code);
  return ok({ checkedInAt: nowIso() });
}

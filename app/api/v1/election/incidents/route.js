import { run } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { getRegistrant, getViewer } from "@/lib/auth";
import { agentFor } from "@/lib/election";
import { attachMedia } from "@/lib/registration";
import { ELECTION_INCIDENTS, SEVERITY } from "@/lib/options";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

/** POST /api/v1/election/incidents { category, severity, description, media: [{upload_id, kind}] } */
export async function POST(request) {
  const reg = await getRegistrant();
  const viewer = reg ? null : await getViewer();
  const a = reg ? agentFor(reg.phoneHash)?.assignment : null;
  if (!a && !viewer) return fail(401, "Verify your phone number first.");
  const d = await body(request);
  if (!ELECTION_INCIDENTS.some((o) => o.value === d.category)) return fail(422, "Choose what happened.", { errors: { category: "Choose what happened." } });
  if (!SEVERITY.some((o) => o.value === d.severity)) return fail(422, "Choose how serious it is.", { errors: { severity: "Choose how serious it is." } });
  const pu = a?.pu_code ?? d.pu ?? null;
  if (!pu) return fail(422, "Which polling unit?");
  const id = uuid();
  const mediaIds = attachMedia(
    (d.media ?? []).map((m) => ({ ...m, consent: true, event_name: `Incident at ${pu}`, event_date: new Date().toISOString().slice(0, 10), state: pu.slice(0, 3), lga: pu.slice(0, 7), ward: pu.slice(0, 10) })),
    { ownerType: "incident", ownerId: id, uploadedBy: reg ? reg.phoneHash : `user:${viewer.id}`, uploaderName: reg ? "PU agent" : viewer.name },
  );
  run(
    `INSERT INTO incidents (id, pu_code, state_code, lga_code, ward_code, category, severity, description, media_ids, reported_by, reporter_name)
     VALUES (:id, :pu, :s, :l, :w, :c, :sev, :d, :m, :by, :name)`,
    {
      id, pu, s: pu.slice(0, 3), l: pu.slice(0, 7), w: pu.slice(0, 10), c: d.category, sev: d.severity, d: String(d.description ?? "").slice(0, 1000) || null,
      m: JSON.stringify(mediaIds), by: a?.volunteer_id ?? viewer?.id, name: a ? "PU agent" : viewer.name,
    },
  );
  audit(viewer ?? { name: "PU agent" }, "incident_reported", "incident", id, { pu, category: d.category, severity: d.severity });
  return ok({ id });
}

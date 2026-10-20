import { one, run, nowIso } from "@/lib/db";
import { getRegistrant } from "@/lib/auth";
import { agentFor, isLive, validateResult } from "@/lib/election";
import { attachMedia } from "@/lib/registration";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/election/results { votes: {ADC: n, …}, registered, accredited, rejected, sheet_upload_id }
 * The agent's figures from Form EC8A with a photo of the sheet. A collation
 * agent or coordinator confirms them before they count as confirmed.
 */
export async function POST(request) {
  const reg = await getRegistrant();
  if (!reg) return fail(401, "Verify your phone number first.");
  if (!isLive()) return fail(409, "Result capture opens on election day.");
  const a = agentFor(reg.phoneHash)?.assignment;
  if (!a) return fail(404, "You are not assigned to a polling unit.");
  const d = await body(request);
  const { e, votes } = validateResult(d);
  if (Object.keys(e).length) return fail(422, "Some figures need attention.", { errors: e });
  const existing = one("SELECT * FROM results WHERE pu_code = :pu", { pu: a.pu_code });
  if (existing?.confirmed_at) return fail(409, "This result has already been confirmed. Call your ward coordinator to correct it.");
  const [mediaId] = attachMedia(
    [{ upload_id: d.sheet_upload_id, kind: "photo", consent: true, event_name: `Form EC8A ${a.pu_code}`, event_date: new Date().toISOString().slice(0, 10), state: a.pu_code.slice(0, 3), lga: a.pu_code.slice(0, 7), ward: a.pu_code.slice(0, 10) }],
    { ownerType: "result", ownerId: a.pu_code, uploadedBy: reg.phoneHash, uploaderName: "PU agent" },
  );
  if (!mediaId) return fail(422, "The result sheet photo didn't finish uploading. Try again.", { errors: { sheet: "Upload the photo again." } });
  const n = (v) => (v === "" || v == null ? null : Math.max(0, Math.round(Number(v))));
  run(
    `INSERT INTO results (id, pu_code, state_code, lga_code, ward_code, reported_by, party_votes, registered_voters, accredited_voters, rejected_votes, sheet_media_id, created_at)
     VALUES (:id, :pu, :s, :l, :w, :by, :votes, :reg, :acc, :rej, :m, :now)
     ON CONFLICT(pu_code) DO UPDATE SET party_votes = :votes, registered_voters = :reg, accredited_voters = :acc, rejected_votes = :rej, sheet_media_id = :m, reported_by = :by, created_at = :now`,
    {
      id: crypto.randomUUID(), pu: a.pu_code, s: a.pu_code.slice(0, 3), l: a.pu_code.slice(0, 7), w: a.pu_code.slice(0, 10), by: a.volunteer_id,
      votes: JSON.stringify(votes), reg: n(d.registered), acc: n(d.accredited), rej: n(d.rejected), m: mediaId, now: nowIso(),
    },
  );
  audit({ name: "PU agent" }, "result_submitted", "pu", a.pu_code, { votes });
  return ok({ ok: true });
}

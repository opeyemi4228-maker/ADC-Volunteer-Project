import { verifyOtp, clientIp } from "@/lib/auth";
import { normalizePhone } from "@/lib/validate";
import { validateVolunteer, createVolunteer, volunteerByPhone } from "@/lib/registration";
import { send } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/sync/batch { records: [{ clientId, phone, code, data, capturedAt, lat, lng }] }
 * The field agent's offline queue. Each record is validated and created on
 * its own, so one bad record never blocks the rest; the reply says, per
 * clientId, what happened. Re-sending a record that already landed is safe.
 */
export async function POST(request) {
  const { viewer, denied } = await requirePower("field_agent");
  if (denied) return denied;
  const { records } = await body(request);
  if (!Array.isArray(records) || records.length > 100) return fail(422, "Send between 1 and 100 records.");

  const results = [];
  for (const r of records) {
    const phone = normalizePhone(r.phone);
    if (!phone) { results.push({ clientId: r.clientId, ok: false, error: "Phone number is not a Nigerian mobile number." }); continue; }
    const existing = volunteerByPhone(phone);
    if (existing) {
      const mine = existing.registered_by_agent === viewer.id;
      results.push(mine ? { clientId: r.clientId, ok: true, publicId: existing.public_id, repeat: true } : { clientId: r.clientId, ok: false, error: "This number is already registered." });
      continue;
    }
    const errors = validateVolunteer(r.data ?? {}, { channel: "field_agent" });
    if (Object.keys(errors).length) { results.push({ clientId: r.clientId, ok: false, error: Object.values(errors)[0], errors }); continue; }
    const confirmed = r.code ? verifyOtp(phone, r.code, "agent_confirm").ok : false;
    const lat = Number.isFinite(r.lat) ? Math.round(r.lat * 1e4) / 1e4 : null;
    const lng = Number.isFinite(r.lng) ? Math.round(r.lng * 1e4) / 1e4 : null;
    const v = createVolunteer(r.data, { phone, channel: "field_agent", agentId: viewer.id, agentLat: lat, agentLng: lng, phoneVerified: confirmed });
    if (v.error) { results.push({ clientId: r.clientId, ok: false, error: v.error }); continue; }
    await send({ to: phone, template: "volunteer_submitted", vars: { name: v.firstName, id: v.publicId } });
    results.push({ clientId: r.clientId, ok: true, publicId: v.publicId, phoneConfirmed: confirmed });
  }
  audit(viewer, "field_sync", "volunteer", null, { received: records.length, created: results.filter((x) => x.ok && !x.repeat).length }, await clientIp());
  return ok({ results });
}

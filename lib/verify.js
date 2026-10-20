import { all, one, run, nowIso } from "./db.js";
import { open } from "./crypto.js";
import { scopeSql } from "./scope.js";
import { send, sendEmail } from "./notify.js";
import { certificateNumber } from "./certificate.js";
import { audit } from "./audit.js";

/**
 * Verification decisions (spec §9.2). A record can only be decided by a
 * coordinator whose scope contains it; verifying needs the method used
 * (phone call, in-person meeting, known to coordinator).
 */

export const METHODS = { phone_call: "Phone call", in_person: "In-person meeting", known: "Known to coordinator" };
const SITE = process.env.SITE_URL ?? "http://localhost:3000";

function scopedVolunteer(viewer, id) {
  const s = scopeSql(viewer, "volunteer", "v");
  return one(`SELECT v.* FROM volunteers v WHERE v.id = :vid AND ${s.sql}`, { vid: id, ...s.params });
}

export async function decideVolunteer(viewer, id, action, input = {}, ip = null) {
  const v = scopedVolunteer(viewer, id);
  if (!v) return { status: 404, error: "Volunteer not found in your area." };
  const can = (p) => viewer.powers.includes(p);
  const phone = open(v.phone_enc);

  if (!can("verify")) return { status: 403, error: "Your role does not allow this." };

  if (action === "resolve-flag") {
    run("UPDATE duplicate_flags SET resolved_at = :now, resolved_by = :u WHERE id = :f AND entity_id = :v", { now: nowIso(), u: viewer.id, f: input.flagId, v: v.id });
  } else if (action === "verify") {
    if (!METHODS[input.method]) return { status: 422, error: "Say how you verified this volunteer." };
    run(
      `UPDATE volunteers SET status = 'verified', status_reason = NULL, verified_by = :u, verified_at = :now, verification_method = :m,
       phone_verified_at = COALESCE(phone_verified_at, CASE WHEN :m = 'phone_call' THEN :now END), updated_at = :now WHERE id = :id`,
      { u: viewer.id, now: nowIso(), m: input.method, id: v.id },
    );
    await send({ to: phone, template: "volunteer_verified", vars: { group: "ADC" } });
    const fresh = one("SELECT * FROM volunteers WHERE id = :id", { id: v.id });
    const account = one("SELECT email_enc FROM users WHERE volunteer_id = :v AND active = 1", { v: v.id });
    const email = open(account?.email_enc) || open(v.email_enc);
    if (email) {
      await sendEmail({
        to: email,
        subject: "You're now a verified ADC volunteer",
        heading: `Welcome aboard, ${v.first_name}`,
        paragraphs: [
          `Your coordinator has verified you as an ADC volunteer (${v.public_id}).`,
          `Your certificate of registration (No. ${certificateNumber(fresh)}) and your volunteer ID card are ready. Sign in with your phone number and password to download them.`,
        ],
        button: { label: "Get my certificate", href: `${SITE}/login` },
        template: "volunteer_approved",
      });
    }
  } else if (action === "reject") {
    const reason = String(input.reason ?? "").trim();
    if (!reason) return { status: 422, error: "Give a reason. The volunteer will see it." };
    run("UPDATE volunteers SET status = 'rejected', status_reason = :r, updated_at = :now WHERE id = :id", { r: reason.slice(0, 300), now: nowIso(), id: v.id });
    await send({ to: phone, template: "rejected", vars: { id: v.public_id, reason: reason.slice(0, 60) } });
  } else if (action === "request-info") {
    const note = String(input.message ?? "").trim();
    if (!note) return { status: 422, error: "Say what information you need." };
    run("UPDATE volunteers SET status = 'info_requested', status_reason = :r, updated_at = :now WHERE id = :id", { r: note.slice(0, 300), now: nowIso(), id: v.id });
    await send({ to: phone, template: "more_info", vars: { link: `${SITE}/status` } });
  } else {
    return { status: 404, error: "Unknown action." };
  }
  audit(viewer, `volunteer_${action.replace("-", "_")}`, "volunteer", v.id, { method: input.method, reason: input.reason ?? input.message, flag: input.flagId }, ip);
  return { ok: true };
}

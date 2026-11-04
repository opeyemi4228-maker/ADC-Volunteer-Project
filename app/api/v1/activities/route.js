import { one, all, run, tx, nextCounter } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { checkLocation } from "@/lib/geo";
import { scopeSql, coversArea } from "@/lib/scope";
import { isValidIsoDate, isFutureDate } from "@/lib/validate";
import { attachMedia } from "@/lib/registration";
import { volunteerContext } from "@/lib/volunteer-portal";
import { ACTIVITY_TYPES, VOTER_CONCERNS, INCIDENT_TYPES } from "@/lib/options";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

const has = (list, v) => list.some((o) => o.value === v);
const num = (v) => (v === "" || v == null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : NaN);

/**
 * POST /api/v1/activities: report an activity (spec §9.4), with media.
 * Verified volunteers report their own (it is linked to them and to their
 * support group, and waits for the Super Admin's review); the Super Admin can
 * log one for anyone.
 */
export async function POST(request) {
  const { viewer, denied } = await requirePower(null);
  if (denied) return denied;
  const isVolunteer = viewer.powers.includes("volunteer");
  if (!isVolunteer && !viewer.powers.includes("log_activity")) return fail(403, "Your role does not allow this.");
  const volunteer = isVolunteer ? await volunteerContext(viewer.roles.find((r) => r.role === "volunteer").area_code) : null;
  if (isVolunteer && !volunteer?.canReport) return fail(403, "You can report activities once the Super Admin has verified your registration.");
  const d = await body(request);
  const e = {};

  // A volunteer's activity belongs to their own group; the Super Admin may pick any.
  let group = null;
  if (volunteer?.group_id) group = await one("SELECT * FROM support_groups WHERE id = :id", { id: volunteer.group_id });
  else if (d.group_id && !volunteer) {
    const s = scopeSql(viewer, "group", "g");
    group = await one(`SELECT g.* FROM support_groups g WHERE g.id = :gid AND ${s.sql}`, { gid: d.group_id, ...s.params });
    if (!group) e.group_id = "Choose a group in your area.";
  }
  if (!has(ACTIVITY_TYPES, d.type)) e.type = "Choose the activity type.";
  if (!isValidIsoDate(d.date)) e.date = "Enter the date.";
  else if (isFutureDate(d.date)) e.date = "The date cannot be in the future.";
  const locErr = checkLocation({ state: d.location?.state, lga: d.location?.lga, ward: d.location?.ward }, { needWard: false });
  if (locErr) e.location = locErr;
  else if (volunteer && d.location.state !== volunteer.vote_state_code) e.location = "Choose a place in your own state, where you are registered to vote.";
  else if (!volunteer && !coversArea(viewer, d.location.ward || d.location.lga)) e.location = "Choose a place inside your area.";
  for (const k of ["attendance", "households_reached", "new_signups"]) if (Number.isNaN(num(d[k]))) e[k] = "Enter a whole number.";
  if (d.type === "door_to_door" && num(d.households_reached) == null) e.households_reached = "How many households did you reach?";
  if (d.incident_type && !has(INCIDENT_TYPES, d.incident_type)) e.incident_type = "Choose an option.";
  if (d.incident_type && d.incident_type !== "none" && !String(d.incident_details ?? "").trim()) e.incident_details = "Describe what happened.";
  if (String(d.description ?? "").length > 1000) e.description = "Keep it to 1,000 characters.";
  if ((d.media ?? []).some((m) => !m.consent)) e.media = "Confirm consent for every photo and video, or remove it.";
  if (Object.keys(e).length) return fail(422, "Some answers need attention.", { errors: e });

  const out = await tx(async () => {
    const id = uuid();
    const publicId = `ADC-ACT-${String(await nextCounter("activity", 1000)).padStart(6, "0")}`;
    await run(
      `INSERT INTO activities (id, public_id, group_id, type, title, date, state_code, lga_code, ward_code, description, attendance,
        households_reached, new_signups, concerns, incident_type, incident_details, reported_by, reporter_name, volunteer_id, review_status)
       VALUES (:id, :pid, :g, :type, :title, :date, :s, :l, :w, :desc, :att, :hh, :ns, :con, :inc, :incd, :by, :name, :vol, :rs)`,
      {
        id, pid: publicId, g: group?.id ?? null, type: d.type, title: String(d.title ?? "").trim().slice(0, 120) || null, date: d.date,
        s: d.location.state, l: d.location.lga, w: d.location.ward || null, desc: String(d.description ?? "").trim() || null,
        att: num(d.attendance), hh: num(d.households_reached), ns: num(d.new_signups),
        con: JSON.stringify((d.concerns ?? []).filter((c) => has(VOTER_CONCERNS, c))),
        inc: d.incident_type || "none", incd: d.incident_type && d.incident_type !== "none" ? String(d.incident_details).slice(0, 1000) : null,
        by: viewer.id, name: volunteer?.name ?? viewer.name, vol: volunteer?.id ?? null, rs: volunteer ? "submitted" : "approved",
      },
    );
    const media = await attachMedia(
      (d.media ?? []).map((m) => ({ ...m, event_name: d.title || d.type.replace("_", " "), event_date: d.date, state: d.location.state, lga: d.location.lga, ward: d.location.ward, attendance: d.attendance })),
      { ownerType: "activity", ownerId: id, groupId: group?.id ?? null, uploadedBy: `user:${viewer.id}`, uploaderName: volunteer?.name ?? viewer.name, volunteerId: volunteer?.id ?? null },
    );
    return { id, publicId, media: media.length };
  });
  await audit(viewer, "activity_reported", "activity", out.id, { group: group?.public_id, incident: d.incident_type, volunteer: volunteer?.public_id }, await clientIp());
  return ok(out);
}

/** GET /api/v1/activities?area=&from=&to= */
export async function GET(request) {
  const { viewer, denied } = await requirePower("view_media");
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const s = scopeSql(viewer, "activity", "a");
  const rows = await all(
    `SELECT a.* FROM activities a WHERE ${s.sql} AND (:from::text = '' OR a.date >= :from) AND (:to::text = '' OR a.date <= :to)
     AND (:area::text = '' OR a.ward_code LIKE :area || '%' OR a.lga_code LIKE :area || '%' OR a.state_code = :area) ORDER BY a.date DESC LIMIT 500`,
    { ...s.params, from: q.get("from") ?? "", to: q.get("to") ?? "", area: q.get("area") ?? "" },
  );
  return ok({ activities: rows.map((r) => ({ ...r, concerns: JSON.parse(r.concerns ?? "[]") })) });
}

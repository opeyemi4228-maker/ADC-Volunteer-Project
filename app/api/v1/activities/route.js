import { one, all, run, tx, nextCounter } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { checkLocation } from "@/lib/geo";
import { scopeSql, coversArea } from "@/lib/scope";
import { isValidIsoDate, isFutureDate } from "@/lib/validate";
import { attachMedia } from "@/lib/registration";
import { ACTIVITY_TYPES, VOTER_CONCERNS, INCIDENT_TYPES } from "@/lib/options";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

const has = (list, v) => list.some((o) => o.value === v);
const num = (v) => (v === "" || v == null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : NaN);

/** POST /api/v1/activities: report an activity (spec §9.4), with media. */
export async function POST(request) {
  const { viewer, denied } = await requirePower("log_activity");
  if (denied) return denied;
  const d = await body(request);
  const e = {};

  // The group must be one the viewer can see; a group coordinator reports for their own group.
  let group = null;
  if (d.group_id) {
    const s = scopeSql(viewer, "group", "g");
    group = one(`SELECT g.* FROM support_groups g WHERE g.id = :gid AND ${s.sql}`, { gid: d.group_id, ...s.params });
    if (!group) e.group_id = "Choose a group in your area.";
  }
  if (!has(ACTIVITY_TYPES, d.type)) e.type = "Choose the activity type.";
  if (!isValidIsoDate(d.date)) e.date = "Enter the date.";
  else if (isFutureDate(d.date)) e.date = "The date cannot be in the future.";
  const locErr = checkLocation({ state: d.location?.state, lga: d.location?.lga, ward: d.location?.ward }, { needWard: false });
  if (locErr) e.location = locErr;
  else if (!group && !coversArea(viewer, d.location.lga)) e.location = "Choose a place inside your area.";
  for (const k of ["attendance", "households_reached", "new_signups"]) if (Number.isNaN(num(d[k]))) e[k] = "Enter a whole number.";
  if (d.type === "door_to_door" && num(d.households_reached) == null) e.households_reached = "How many households did you reach?";
  if (d.incident_type && !has(INCIDENT_TYPES, d.incident_type)) e.incident_type = "Choose an option.";
  if (d.incident_type && d.incident_type !== "none" && !String(d.incident_details ?? "").trim()) e.incident_details = "Describe what happened.";
  if (String(d.description ?? "").length > 1000) e.description = "Keep it to 1,000 characters.";
  if ((d.media ?? []).some((m) => !m.consent)) e.media = "Confirm consent for every photo and video, or remove it.";
  if (Object.keys(e).length) return fail(422, "Some answers need attention.", { errors: e });

  const out = tx(() => {
    const id = uuid();
    const publicId = `ADC-ACT-${String(nextCounter("activity", 1000)).padStart(6, "0")}`;
    run(
      `INSERT INTO activities (id, public_id, group_id, type, title, date, state_code, lga_code, ward_code, description, attendance,
        households_reached, new_signups, concerns, incident_type, incident_details, reported_by, reporter_name)
       VALUES (:id, :pid, :g, :type, :title, :date, :s, :l, :w, :desc, :att, :hh, :ns, :con, :inc, :incd, :by, :name)`,
      {
        id, pid: publicId, g: group?.id ?? null, type: d.type, title: String(d.title ?? "").trim().slice(0, 120) || null, date: d.date,
        s: d.location.state, l: d.location.lga, w: d.location.ward || null, desc: String(d.description ?? "").trim() || null,
        att: num(d.attendance), hh: num(d.households_reached), ns: num(d.new_signups),
        con: JSON.stringify((d.concerns ?? []).filter((c) => has(VOTER_CONCERNS, c))),
        inc: d.incident_type || "none", incd: d.incident_type && d.incident_type !== "none" ? String(d.incident_details).slice(0, 1000) : null,
        by: viewer.id, name: viewer.name,
      },
    );
    const media = attachMedia(
      (d.media ?? []).map((m) => ({ ...m, event_name: d.title || d.type.replace("_", " "), event_date: d.date, state: d.location.state, lga: d.location.lga, ward: d.location.ward, attendance: d.attendance })),
      { ownerType: "activity", ownerId: id, groupId: group?.id ?? null, uploadedBy: `user:${viewer.id}`, uploaderName: viewer.name },
    );
    return { id, publicId, media: media.length };
  });
  audit(viewer, "activity_reported", "activity", out.id, { group: group?.public_id, incident: d.incident_type }, await clientIp());
  return ok(out);
}

/** GET /api/v1/activities?area=&from=&to= */
export async function GET(request) {
  const { viewer, denied } = await requirePower("view_media");
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const s = scopeSql(viewer, "activity", "a");
  const rows = all(
    `SELECT a.* FROM activities a WHERE ${s.sql} AND (:from = '' OR a.date >= :from) AND (:to = '' OR a.date <= :to)
     AND (:area = '' OR a.ward_code LIKE :area || '%' OR a.lga_code LIKE :area || '%' OR a.state_code = :area) ORDER BY a.date DESC LIMIT 500`,
    { ...s.params, from: q.get("from") ?? "", to: q.get("to") ?? "", area: q.get("area") ?? "" },
  );
  return ok({ activities: rows.map((r) => ({ ...r, concerns: JSON.parse(r.concerns ?? "[]") })) });
}

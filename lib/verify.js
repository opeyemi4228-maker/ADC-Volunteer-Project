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

function scopedGroup(viewer, id) {
  const s = scopeSql(viewer, "group", "g");
  return one(`SELECT g.* FROM support_groups g WHERE g.id = :gid AND ${s.sql}`, { gid: id, ...s.params });
}

function scopedVolunteer(viewer, id) {
  const s = scopeSql(viewer, "volunteer", "v");
  return one(`SELECT v.* FROM volunteers v WHERE v.id = :vid AND ${s.sql}`, { vid: id, ...s.params });
}

/** Email addresses of the accounts that manage a group. */
function groupEmails(groupId) {
  return all(
    `SELECT u.email_enc, u.name FROM role_assignments r JOIN users u ON u.id = r.user_id
     WHERE r.role = 'group_coordinator' AND r.area_code = :g AND u.active = 1 AND u.email_enc IS NOT NULL`,
    { g: groupId },
  ).map((u) => ({ email: open(u.email_enc), name: u.name })).filter((u) => u.email);
}

async function emailGroup(groupId, message) {
  for (const u of groupEmails(groupId)) await sendEmail({ to: u.email, ...message, paragraphs: [`Hello ${u.name.split(" ")[0]},`, ...message.paragraphs] });
}

function coordinatorPhone(groupId) {
  const l = one("SELECT phone_enc FROM group_leaders WHERE group_id = :g AND position = 'coordinator' ORDER BY sort LIMIT 1", { g: groupId });
  return l ? open(l.phone_enc) : null;
}

export async function decideGroup(viewer, id, action, input = {}, ip = null) {
  const g = scopedGroup(viewer, id);
  if (!g) return { status: 404, error: "Group not found in your area." };
  const can = (p) => viewer.powers.includes(p);
  const aboveLga = ["state", "zonal", "national"].includes(g.operating_level);
  const phone = coordinatorPhone(g.id);

  if (action === "resolve-flag") {
    if (!can("verify")) return { status: 403, error: "Your role does not allow this." };
    run("UPDATE duplicate_flags SET resolved_at = :now, resolved_by = :u WHERE id = :f AND entity_id = :g", { now: nowIso(), u: viewer.id, f: input.flagId, g: g.id });
    audit(viewer, "duplicate_flag_resolved", "group", g.id, { flag: input.flagId }, ip);
    return { ok: true };
  }
  if (!can("verify")) return { status: 403, error: "Your role does not allow this." };
  if (aboveLga && ["verify", "reject"].includes(action) && !can("approve_state_groups")) {
    return { status: 403, error: "State, zonal and national groups are approved by a state coordinator or above." };
  }

  if (action === "verify") {
    if (!METHODS[input.method]) return { status: 422, error: "Say how you verified this group." };
    run("UPDATE support_groups SET status = 'verified', status_reason = NULL, verified_by = :u, verified_at = :now, verification_method = :m, updated_at = :now WHERE id = :id", { u: viewer.id, now: nowIso(), m: input.method, id: g.id });
    if (phone) await send({ to: phone, template: "group_verified", vars: { group: g.name, code: g.join_code, link: `${SITE}/join/${g.join_code}` } });
    const fresh = one("SELECT * FROM support_groups WHERE id = :id", { id: g.id });
    const cert = certificateNumber(fresh);
    await emailGroup(g.id, {
      subject: `Approved: ${g.name} is now a verified ADC support group`,
      heading: `${g.name} has been approved`,
      paragraphs: [
        `Good news. Your support group has been verified by your coordinator and is now an official ADC support group (${g.public_id}).`,
        `Your certificate of registration (No. ${cert}) is ready. Sign in to your group dashboard to download it.`,
        `Invite members to join with the code ${g.join_code}, or share this link: ${SITE}/join/${g.join_code}`,
      ],
      button: { label: "Download my certificate", href: `${SITE}/workspace` },
      template: "group_approved",
    });
  } else if (action === "reject") {
    const reason = String(input.reason ?? "").trim();
    if (!reason) return { status: 422, error: "Give a reason. The applicant will see it." };
    run("UPDATE support_groups SET status = 'rejected', status_reason = :r, updated_at = :now WHERE id = :id", { r: reason.slice(0, 300), now: nowIso(), id: g.id });
    if (phone) await send({ to: phone, template: "rejected", vars: { id: g.public_id, reason: reason.slice(0, 60) } });
    await emailGroup(g.id, {
      subject: `Your support group registration (${g.public_id})`,
      heading: "Your registration was not approved",
      paragraphs: [`The registration for ${g.name} was not approved. Reason: ${reason}`, "If you think this is a mistake, reply to this email or contact your ward coordinator."],
      template: "group_rejected",
    });
  } else if (action === "request-info") {
    const note = String(input.message ?? "").trim();
    if (!note) return { status: 422, error: "Say what information you need." };
    run("UPDATE support_groups SET status = 'info_requested', status_reason = :r, updated_at = :now WHERE id = :id", { r: note.slice(0, 300), now: nowIso(), id: g.id });
    if (phone) await send({ to: phone, template: "more_info", vars: { link: `${SITE}/status` } });
    await emailGroup(g.id, {
      subject: `We need a little more information about ${g.name}`,
      heading: "We need a little more information",
      paragraphs: [`Your coordinator is reviewing ${g.name} and asked: "${note}"`, "Sign in to your group dashboard to update your details, or reply to your coordinator."],
      button: { label: "Open my group dashboard", href: `${SITE}/workspace` },
      template: "group_more_info",
    });
  } else if (action === "suspend" || action === "reinstate") {
    if (!can("approve_state_groups")) return { status: 403, error: "Only a state coordinator or above can suspend a group." };
    run("UPDATE support_groups SET status = :s, status_reason = :r, updated_at = :now WHERE id = :id", {
      s: action === "suspend" ? "suspended" : "verified", r: action === "suspend" ? String(input.reason ?? "").slice(0, 300) : null, now: nowIso(), id: g.id,
    });
  } else {
    return { status: 404, error: "Unknown action." };
  }
  audit(viewer, `group_${action.replace("-", "_")}`, "group", g.id, { method: input.method, reason: input.reason ?? input.message }, ip);
  return { ok: true };
}

export async function decideVolunteer(viewer, id, action, input = {}, ip = null) {
  const v = scopedVolunteer(viewer, id);
  if (!v) return { status: 404, error: "Volunteer not found in your area." };
  const can = (p) => viewer.powers.includes(p);
  const phone = open(v.phone_enc);

  if (action === "approve-member" || action === "decline-member") {
    if (!can("approve_members") && !can("verify")) return { status: 403, error: "Your role does not allow this." };
    if (!v.group_id) return { status: 422, error: "This volunteer has not joined a group." };
    if (action === "approve-member") run("UPDATE volunteers SET group_status = 'approved', updated_at = :now WHERE id = :id", { now: nowIso(), id: v.id });
    else run("UPDATE volunteers SET group_id = NULL, group_status = NULL, updated_at = :now WHERE id = :id", { now: nowIso(), id: v.id });
    audit(viewer, `member_${action === "approve-member" ? "approved" : "declined"}`, "volunteer", v.id, { group: v.group_id }, ip);
    return { ok: true };
  }
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
    const group = v.group_id ? one("SELECT name FROM support_groups WHERE id = :id", { id: v.group_id }) : null;
    await send({ to: phone, template: "volunteer_verified", vars: { group: group?.name ?? "ADC" } });
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

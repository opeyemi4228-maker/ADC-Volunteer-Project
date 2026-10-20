import { all, one, run, scalar, tx, nowIso } from "./db.js";
import { open, uuid } from "./crypto.js";
import { scopeSql } from "./scope.js";
import { areaName } from "./geo.js";
import { send } from "./notify.js";
import { VOLUNTEER_ROLES, AVAILABILITY, LANGUAGES, PVC_STATUS, labelOf } from "./options.js";

/**
 * Campaign messages (spec §9.6). Only volunteers who opted in to campaign
 * messages are ever counted or sent to. The count and cost are shown before
 * sending, and anything to more than 10,000 people waits for a second approver.
 */

export const APPROVAL_THRESHOLD = 10_000;
export const COST = { sms: 4, whatsapp: 6, email: 0.5 }; // naira per message (placeholder rates)

export function segments(body, channel) {
  if (channel !== "sms") return 1;
  const gsm = /^[\x20-\x7E\n£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉÄÖÑÜ§¿äöñüà€]*$/.test(body);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return body.length <= single ? 1 : Math.ceil(body.length / multi);
}

function audienceWhere(viewer, f) {
  const s = scopeSql(viewer, "volunteer", "v");
  const parts = [s.sql, "v.status != 'rejected'", "v.deletion_requested_at IS NULL",
    "EXISTS (SELECT 1 FROM consents c WHERE c.subject_type = 'volunteer' AND c.subject_id = v.id AND c.consent_type = 'messaging' AND c.granted = 1 AND c.withdrawn_at IS NULL)"];
  const params = { ...s.params };
  if (f.area) { parts.push("(v.vote_ward_code LIKE :area || '%' OR v.vote_state_code = :area)"); params.area = f.area; }
  if (f.group) { parts.push("v.group_id = :group"); params.group = f.group; }
  if (f.role) { parts.push("EXISTS (SELECT 1 FROM volunteer_roles r WHERE r.volunteer_id = v.id AND r.role = :role)"); params.role = f.role; }
  if (f.availability) { parts.push("v.availability = :av"); params.av = f.availability; }
  if (f.language) { parts.push("EXISTS (SELECT 1 FROM volunteer_languages l WHERE l.volunteer_id = v.id AND l.language = :lang)"); params.lang = f.language; }
  if (f.pvc) { parts.push("v.pvc_status = :pvc"); params.pvc = f.pvc; }
  if (f.verified) parts.push("v.status = 'verified'");
  if (f.channel === "email") parts.push("v.email_enc IS NOT NULL");
  return { sql: parts.join(" AND "), params };
}

export function audienceLabel(f) {
  return [
    f.area ? areaName(f.area) : "Your whole area",
    f.group && one("SELECT name FROM support_groups WHERE id = :id", { id: f.group })?.name,
    f.role && labelOf(VOLUNTEER_ROLES, f.role),
    f.availability && labelOf(AVAILABILITY, f.availability),
    f.language && `${labelOf(LANGUAGES, f.language)} speakers`,
    f.pvc && `PVC: ${labelOf(PVC_STATUS, f.pvc)}`,
    f.verified && "verified only",
  ].filter(Boolean).join(" · ");
}

export function preview(viewer, f, body = "", channel = "sms") {
  const w = audienceWhere(viewer, { ...f, channel });
  const count = scalar(`SELECT COUNT(*) FROM volunteers v WHERE ${w.sql}`, w.params);
  const segs = segments(body, channel);
  return { count, segments: segs, cost: Math.round(count * segs * COST[channel] * 100) / 100, needsApproval: count > APPROVAL_THRESHOLD, label: audienceLabel(f) };
}

async function deliver(messageId) {
  const m = one("SELECT * FROM messages WHERE id = :id", { id: messageId });
  const recipients = all(
    "SELECT v.id, v.phone_enc, v.email_enc FROM message_recipients r JOIN volunteers v ON v.id = r.volunteer_id WHERE r.message_id = :id AND r.status = 'queued'",
    { id: messageId },
  );
  for (const r of recipients) {
    const to = m.channel === "email" ? open(r.email_enc) : open(r.phone_enc);
    if (to) await send({ channel: m.channel, to, body: m.body });
    run("UPDATE message_recipients SET status = 'sent' WHERE message_id = :m AND volunteer_id = :v", { m: messageId, v: r.id });
  }
  run("UPDATE messages SET status = 'sent', sent_at = :now WHERE id = :id", { id: messageId, now: nowIso() });
}

export async function createMessage(viewer, { channel, body, subject, audience }) {
  if (!COST[channel]) return { error: "Choose a channel." };
  const text = String(body ?? "").trim();
  if (text.length < 5) return { error: "Write the message." };
  if (channel === "sms" && text.length > 459) return { error: "Keep SMS messages to three parts (459 characters)." };
  const p = preview(viewer, audience ?? {}, text, channel);
  if (p.count === 0) return { error: "Nobody in this audience has agreed to receive campaign messages." };
  const w = audienceWhere(viewer, { ...(audience ?? {}), channel });
  const id = uuid();
  tx(() => {
    run(
      `INSERT INTO messages (id, channel, subject, body, audience, audience_label, recipient_count, estimated_cost, status, created_by, creator_name)
       VALUES (:id, :ch, :sub, :body, :aud, :label, :n, :cost, :st, :by, :name)`,
      {
        id, ch: channel, sub: channel === "email" ? String(subject ?? "").slice(0, 120) || null : null, body: text,
        aud: JSON.stringify(audience ?? {}), label: p.label, n: p.count, cost: p.cost, st: p.needsApproval ? "awaiting_approval" : "sending",
        by: viewer.id, name: viewer.name,
      },
    );
    run(`INSERT INTO message_recipients (message_id, volunteer_id) SELECT :id, v.id FROM volunteers v WHERE ${w.sql}`, { id, ...w.params });
  });
  if (!p.needsApproval) await deliver(id);
  return { id, ...p, status: p.needsApproval ? "awaiting_approval" : "sent" };
}

export async function approveMessage(viewer, id) {
  const m = one("SELECT * FROM messages WHERE id = :id AND status = 'awaiting_approval'", { id });
  if (!m) return { error: "This message is not waiting for approval." };
  if (m.created_by === viewer.id) return { error: "A different person must approve a message you wrote." };
  run("UPDATE messages SET approved_by = :u, approver_name = :n, status = 'sending' WHERE id = :id", { u: viewer.id, n: viewer.name, id });
  await deliver(id);
  return { ok: true };
}

import { all, one } from "./db.js";
import { areaName, placeLabel, stateOf } from "./geo.js";

/**
 * What a volunteer does, and what the supervising body sees of it.
 *
 *   Tasks       set by the Super Admin for an area (nationwide, a zone, state,
 *               LGA or ward), optionally only for volunteers who offered one
 *               role, or for one support group. A volunteer sees every task
 *               that reaches them and reports progress, with photos.
 *   Activities  meetings, door-to-door, rallies, reported by the volunteer
 *               with photos and videos, reviewed by the Super Admin.
 *   Media       every photo and video a volunteer sends, with its review
 *               status and the reason if it was not accepted.
 *   Messages    every campaign message sent to them.
 */

/** The volunteer record the portal needs, or null. */
export async function volunteerContext(volunteerId) {
  const v = await one(
    `SELECT id, public_id, first_name, surname, status, vote_state_code, vote_lga_code, vote_ward_code, vote_pu_code, group_id,
       (SELECT COALESCE(json_agg(role), '[]') FROM volunteer_roles r WHERE r.volunteer_id = volunteers.id) AS roles
     FROM volunteers WHERE id = :id`,
    { id: volunteerId },
  );
  if (!v) return null;
  return { ...v, roles: JSON.parse(v.roles), name: `${v.first_name} ${v.surname}`, zone: stateOf(v.vote_state_code)?.zone ?? null, canReport: v.status === "verified" };
}

// A task reaches a volunteer only when all of these hold:
//   area   nationwide, their zone, or the state, LGA or ward they vote in
//          (codes nest: ward "FCT-002-09" starts with LGA "FCT-002", which
//          starts with state "FCT", so their most precise code is matched
//          against the task's area by prefix);
//   role   the task is for any role, or one they offered;
//   group  the task names no groups, or names theirs.
// Groups narrow a task's audience; they never widen it past its area.
const REACHES = `
  (t.area_code IS NULL OR t.area_code = 'NG'
    OR (t.area_type = 'zone' AND t.area_code = :zone)
    OR (t.area_type <> 'zone' AND :place::text <> '' AND :place::text LIKE t.area_code || '%'))
  AND (t.role IS NULL OR EXISTS (SELECT 1 FROM volunteer_roles vr WHERE vr.volunteer_id = :v AND vr.role = t.role))
  AND (NOT EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.assignee_type = 'group')
    OR EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.assignee_type = 'group' AND a.assignee_id = :grp))`;
const reachParams = (v) => ({
  v: v.id,
  place: v.vote_ward_code || v.vote_lga_code || v.vote_state_code || "",
  zone: v.zone ?? "",
  grp: v.group_id ?? "",
});

/** Every task that reaches this volunteer, open ones first, with their own contribution. */
export async function tasksFor(v) {
  const rows = await all(
    `SELECT t.id, t.title, t.description, t.due_date, t.target_value, t.target_unit, t.area_type, t.area_code, t.role, t.status, t.created_at,
       (SELECT COALESCE(SUM(achieved_value), 0) FROM task_reports r WHERE r.task_id = t.id) AS achieved,
       (SELECT COUNT(DISTINCT r.volunteer_id) FROM task_reports r WHERE r.task_id = t.id) AS volunteers,
       (SELECT COALESCE(SUM(achieved_value), 0) FROM task_reports r WHERE r.task_id = t.id AND r.volunteer_id = :v) AS mine,
       (SELECT MAX(created_at) FROM task_reports r WHERE r.task_id = t.id AND r.volunteer_id = :v) AS "lastReport"
     FROM tasks t WHERE ${REACHES}
     ORDER BY (t.status = 'open') DESC, t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 200`,
    reachParams(v),
  );
  return rows.map((t) => ({ ...t, areaName: !t.area_code || t.area_code === "NG" ? "Nationwide" : areaName(t.area_code) }));
}

/** One task, only if it reaches this volunteer. */
export async function taskFor(v, taskId) {
  return one(`SELECT t.* FROM tasks t WHERE t.id = :id AND ${REACHES}`, { id: taskId, ...reachParams(v) });
}

export async function activitiesBy(volunteerId, limit = 100) {
  const rows = await all(
    `SELECT a.*, (SELECT COUNT(*) FROM media_items m WHERE m.owner_type = 'activity' AND m.owner_id = a.id) AS media
     FROM activities a WHERE a.volunteer_id = :v ORDER BY a.date DESC, a.created_at DESC LIMIT ${Number(limit)}`,
    { v: volunteerId },
  );
  return rows.map((a) => ({ ...a, place: placeLabel(a), concerns: JSON.parse(a.concerns ?? "[]") }));
}

export async function mediaBy(volunteerId, limit = 120) {
  return all(
    `SELECT id, kind, thumbnail_key, medium_key, external_url, event_name, event_date, caption, moderation_status, rejection_reason, owner_type, created_at
     FROM media_items WHERE volunteer_id = :v ORDER BY created_at DESC LIMIT ${Number(limit)}`,
    { v: volunteerId },
  );
}

export async function reportsBy(volunteerId, limit = 100) {
  return all(
    `SELECT r.id, r.achieved_value, r.notes, r.created_at, t.id AS task_id, t.title, t.target_unit,
       (SELECT COUNT(*) FROM media_items m WHERE m.owner_type = 'task_report' AND m.owner_id = r.id) AS media
     FROM task_reports r JOIN tasks t ON t.id = r.task_id WHERE r.volunteer_id = :v ORDER BY r.created_at DESC LIMIT ${Number(limit)}`,
    { v: volunteerId },
  );
}

/** Campaign messages sent to this volunteer, newest first. */
export async function messagesFor(volunteerId, limit = 50) {
  return all(
    `SELECT m.id, m.channel, m.subject, m.body, m.creator_name, COALESCE(m.sent_at, m.created_at) AS sent_at
     FROM message_recipients r JOIN messages m ON m.id = r.message_id
     WHERE r.volunteer_id = :v AND m.status = 'sent' ORDER BY COALESCE(m.sent_at, m.created_at) DESC LIMIT ${Number(limit)}`,
    { v: volunteerId },
  );
}

/** Headline counts for the volunteer's dashboard. */
export async function portalSummary(v) {
  const [counts, tasks] = await Promise.all([
    one(
      `SELECT
         (SELECT COUNT(*) FROM activities WHERE volunteer_id = :v) AS activities,
         (SELECT COUNT(*) FROM task_reports WHERE volunteer_id = :v) AS reports,
         (SELECT COUNT(*) FROM media_items WHERE volunteer_id = :v) AS media,
         (SELECT COUNT(*) FROM media_items WHERE volunteer_id = :v AND moderation_status = 'pending') AS "mediaPending",
         (SELECT COUNT(*) FROM media_items WHERE volunteer_id = :v AND moderation_status IN ('approved', 'publicity')) AS "mediaApproved",
         (SELECT COUNT(*) FROM message_recipients r JOIN messages m ON m.id = r.message_id WHERE r.volunteer_id = :v AND m.status = 'sent') AS messages,
         (SELECT MAX(COALESCE(m.sent_at, m.created_at)) FROM message_recipients r JOIN messages m ON m.id = r.message_id WHERE r.volunteer_id = :v AND m.status = 'sent') AS "lastMessage"`,
      { v: v.id },
    ),
    tasksFor(v),
  ]);
  const open = tasks.filter((t) => t.status === "open");
  return { ...counts, tasks: tasks.length, openTasks: open.length, todo: open.filter((t) => !t.lastReport).length, nextTask: open[0] ?? null };
}

/** Everything one volunteer has done, for their profile in the Super Admin workspace. */
export async function volunteerActivity(volunteerId) {
  const [reports, activities, media, messages, account] = await Promise.all([
    reportsBy(volunteerId, 20),
    activitiesBy(volunteerId, 20),
    mediaBy(volunteerId, 24),
    messagesFor(volunteerId, 10),
    one(
      `SELECT u.id, u.active, u.last_signin_at FROM users u JOIN role_assignments r ON r.user_id = u.id
       WHERE r.role = 'volunteer' AND r.area_code = :v LIMIT 1`,
      { v: volunteerId },
    ),
  ]);
  return { reports, activities, media, messages, account };
}

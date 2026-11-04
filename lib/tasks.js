import { all, one, run, scalar, tx } from "./db.js";
import { uuid } from "./crypto.js";
import { isSuperAdmin, coversArea } from "./scope.js";
import { areaName, areaTypeOf, statesInZone } from "./geo.js";
import { isValidIsoDate } from "./validate.js";
import { VOLUNTEER_ROLES } from "./options.js";

/**
 * Tasks (spec §9.5), set by the Super Admin (or a coordinator, inside their
 * own area) for volunteers:
 * "Door-to-door in Kubwa on Saturday, 200 households". A task reaches every
 * volunteer in its area (nationwide, a zone, state, LGA or ward), optionally
 * only those who offered one role, or only chosen support groups. Volunteers
 * report progress from their dashboard; the task closes when the reports
 * together reach the target.
 */

/** Who a task reaches, in words. */
export function audienceOf(t) {
  const where = !t.area_code || t.area_code === "NG" ? "Volunteers nationwide" : `Volunteers in ${areaName(t.area_code)}`;
  const role = t.role ? ` who offered to be ${VOLUNTEER_ROLES.find((r) => r.value === t.role)?.label.toLowerCase() ?? t.role}` : "";
  const groups = t.groups?.length ? `, in ${t.groups.length === 1 ? t.groups[0].name : `${t.groups.length} chosen groups`}` : "";
  return where + role + groups;
}

/**
 * How many volunteers a task reaches (verified and pending, not rejected).
 * Same rule as the volunteer's side (lib/volunteer-portal.js): area, role and,
 * when the task names groups, membership of one of them.
 */
async function reachCount(t, groupIds = []) {
  const area = !t.area_code || t.area_code === "NG" ? "TRUE"
    : t.area_type === "zone" ? "v.vote_state_code IN (SELECT unnest(:states::text[]))"
      : "COALESCE(v.vote_ward_code, v.vote_lga_code, v.vote_state_code, '') LIKE :a::text || '%'";
  const group = groupIds.length ? "AND v.group_id = ANY(:groups::text[])" : "";
  return scalar(
    `SELECT COUNT(*) FROM volunteers v WHERE v.status != 'rejected' AND ${area} ${group}
       AND (:role::text IS NULL OR EXISTS (SELECT 1 FROM volunteer_roles r WHERE r.volunteer_id = v.id AND r.role = :role))`,
    {
      a: t.area_code ?? "", role: t.role ?? null, states: t.area_type === "zone" ? `{${statesInZone(t.area_code).join(",")}}` : "{}",
      ...(groupIds.length ? { groups: `{${groupIds.join(",")}}` } : {}),
    },
  );
}
/**
 * The tasks the viewer can see, open ones first, with progress, reach and the
 * latest reports: all of them for the Super Admin; for a coordinator, tasks
 * aimed inside their area and tasks they set.
 */
export async function visibleTasks(viewer) {
  const all_ = await all(
    `SELECT t.*, (SELECT COALESCE(SUM(achieved_value), 0) FROM task_reports r WHERE r.task_id = t.id) AS achieved,
       (SELECT COUNT(*) FROM task_reports r WHERE r.task_id = t.id) AS reports,
       (SELECT COUNT(DISTINCT r.volunteer_id) FROM task_reports r WHERE r.task_id = t.id) AS volunteers
     FROM tasks t ORDER BY (t.status = 'open') DESC, t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 500`,
  );
  const tasks = isSuperAdmin(viewer)
    ? all_
    : all_.filter((t) => t.created_by === viewer.id || (t.area_code && t.area_code !== "NG" && t.area_type !== "zone" && coversArea(viewer, t.area_code)));
  const ids = tasks.map((t) => t.id);
  const [recent, groups] = await Promise.all([
    ids.length
      ? all(
        `SELECT * FROM (
           SELECT r.id, r.task_id, r.achieved_value, r.notes, r.created_at, r.reporter_name, r.volunteer_id, v.public_id,
             (SELECT COUNT(*) FROM media_items m WHERE m.owner_type = 'task_report' AND m.owner_id = r.id) AS media,
             row_number() OVER (PARTITION BY r.task_id ORDER BY r.created_at DESC) AS n
           FROM task_reports r LEFT JOIN volunteers v ON v.id = r.volunteer_id WHERE r.task_id = ANY(:ids::text[])
         ) x WHERE n <= 5 ORDER BY created_at DESC`,
        { ids: `{${ids.join(",")}}` },
      )
      : [],
    all(
      `SELECT a.task_id, g.id, g.name FROM task_assignments a JOIN support_groups g ON g.id = a.assignee_id
       WHERE a.assignee_type = 'group'`,
    ),
  ]);
  return Promise.all(tasks.map(async (t) => {
    const mine = groups.filter((g) => g.task_id === t.id).map(({ id, name }) => ({ id, name }));
    return {
      ...t,
      areaName: !t.area_code || t.area_code === "NG" ? "Nationwide" : areaName(t.area_code),
      audience: audienceOf({ ...t, groups: mine }),
      reach: await reachCount(t, mine.map((g) => g.id)),
      recent: recent.filter((r) => r.task_id === t.id),
      groups: mine,
    };
  }));
}

export async function createTask(viewer, d) {
  const e = {};
  const title = String(d.title ?? "").trim();
  if (!viewer.powers.includes("assign_tasks")) return { errors: { title: "Your role does not allow setting tasks." } };
  if (title.length < 3) e.title = "Give the task a short title.";
  if (!isValidIsoDate(d.due_date)) e.due_date = "Choose a due date.";
  if (d.target_value !== "" && d.target_value != null && !(Number(d.target_value) > 0)) e.target_value = "Enter a number above zero, or leave it blank.";
  const area = d.area_code || "NG";
  const type = areaTypeOf(area);
  if (type === "pu" || (type !== "national" && areaName(area) === area)) e.area_code = "Choose a valid area.";
  // Only the Super Admin sets nationwide or zone-wide tasks; a coordinator stays inside their own area.
  else if (!isSuperAdmin(viewer) && (type === "national" || type === "zone" || !coversArea(viewer, area))) e.area_code = "Choose an area inside yours.";
  if (d.role && !VOLUNTEER_ROLES.some((r) => r.value === d.role)) e.role = "Choose a role.";
  const groups = d.assign === "groups"
    ? await all("SELECT id, name FROM support_groups WHERE status = 'verified' AND id = ANY(:ids::text[])", { ids: `{${(d.group_ids ?? []).map(String).join(",")}}` })
    : [];
  if (d.assign === "groups" && groups.length === 0) e.group_ids = "Choose at least one group.";
  if (Object.keys(e).length) return { errors: e };

  const id = uuid();
  await tx(async () => {
    await run(
      `INSERT INTO tasks (id, title, description, due_date, target_value, target_unit, area_type, area_code, role, created_by, creator_name)
       VALUES (:id, :t, :d, :due, :tv, :u, :at, :ac, :role, :by, :name)`,
      {
        id, t: title.slice(0, 120), d: String(d.description ?? "").trim().slice(0, 1000) || null, due: d.due_date,
        tv: d.target_value ? Math.round(Number(d.target_value)) : null, u: String(d.target_unit ?? "").trim().slice(0, 40) || null,
        at: type, ac: area, role: d.role || null, by: viewer.id, name: viewer.name,
      },
    );
    for (const g of groups) await run("INSERT INTO task_assignments (id, task_id, assignee_type, assignee_id) VALUES (:id, :t, 'group', :g)", { id: uuid(), t: id, g: g.id });
  });
  return { id, reach: await reachCount({ area_code: area, area_type: type, role: d.role || null }, groups.map((g) => g.id)) };
}

/** Close or reopen a task: the Super Admin any task, a coordinator the ones they set. */
export async function setTaskStatus(viewer, id, status) {
  if (!["open", "done", "cancelled"].includes(status)) return false;
  const t = await one("SELECT id, created_by FROM tasks WHERE id = :id", { id });
  if (!t || (!isSuperAdmin(viewer) && t.created_by !== viewer.id)) return false;
  await run("UPDATE tasks SET status = :s WHERE id = :id", { s: status, id });
  return true;
}

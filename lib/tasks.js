import { all, one, run, tx } from "./db.js";
import { open, uuid } from "./crypto.js";
import { scopeSql, coversArea } from "./scope.js";
import { areaName, areaTypeOf } from "./geo.js";
import { isValidIsoDate } from "./validate.js";
import { send } from "./notify.js";

/**
 * Tasks (spec §9.5): assigned to groups, individuals or a whole area
 * ("All Kubwa groups: door-to-door on Saturday"), each with a due date, a
 * target and progress reports.
 */

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

/** Tasks the viewer can see: set in their area, or assigned to their group. */
export function visibleTasks(viewer) {
  const s = scopeSql(viewer, "group", "g");
  const groupIds = all(`SELECT g.id FROM support_groups g WHERE ${s.sql}`, s.params).map((r) => r.id);
  const tasks = all(
    `SELECT t.*, (SELECT COALESCE(SUM(achieved_value),0) FROM task_reports r WHERE r.task_id = t.id) AS achieved,
       (SELECT COUNT(*) FROM task_reports r WHERE r.task_id = t.id) AS reports
     FROM tasks t ORDER BY (t.status = 'open') DESC, t.due_date ASC`,
  );
  const assignments = all("SELECT * FROM task_assignments");
  return tasks
    .filter((t) => (t.area_code && coversArea(viewer, t.area_code)) || assignments.some((a) => a.task_id === t.id && a.assignee_type === "group" && groupIds.includes(a.assignee_id)) || t.created_by === viewer.id)
    .map((t) => ({
      ...t,
      areaName: t.area_code ? areaName(t.area_code) : "",
      groups: assignments.filter((a) => a.task_id === t.id && a.assignee_type === "group").map((a) => ({ id: a.assignee_id, name: one("SELECT name FROM support_groups WHERE id = :id", { id: a.assignee_id })?.name })),
      mine: assignments.some((a) => a.task_id === t.id && a.assignee_type === "group" && groupIds.includes(a.assignee_id)),
    }));
}

export async function createTask(viewer, d) {
  const e = {};
  const title = String(d.title ?? "").trim();
  if (title.length < 3) e.title = "Give the task a short title.";
  if (!isValidIsoDate(d.due_date)) e.due_date = "Choose a due date.";
  if (d.target_value !== "" && d.target_value != null && !(Number(d.target_value) > 0)) e.target_value = "Enter a number above zero, or leave it blank.";
  if (!d.area_code || !coversArea(viewer, d.area_code)) e.area_code = "Choose an area you coordinate.";
  const s = scopeSql(viewer, "group", "g");
  const groups = d.assign === "groups"
    ? all(`SELECT g.id, g.name FROM support_groups g WHERE g.status = 'verified' AND ${s.sql}`, s.params).filter((g) => (d.group_ids ?? []).includes(g.id))
    : all(
      `SELECT g.id, g.name FROM support_groups g WHERE g.status = 'verified' AND ${s.sql}
       AND (g.ward_code LIKE :a || '%' OR g.lga_code LIKE :a || '%' OR g.state_code = :a
            OR g.id IN (SELECT group_id FROM group_areas_covered WHERE area_code LIKE :a || '%'))`,
      { ...s.params, a: d.area_code ?? "" },
    );
  if (d.assign === "groups" && groups.length === 0) e.group_ids = "Choose at least one group.";
  if (Object.keys(e).length) return { errors: e };

  const id = uuid();
  tx(() => {
    run(
      `INSERT INTO tasks (id, title, description, due_date, target_value, target_unit, area_type, area_code, created_by, creator_name)
       VALUES (:id, :t, :d, :due, :tv, :u, :at, :ac, :by, :name)`,
      {
        id, t: title.slice(0, 120), d: String(d.description ?? "").trim().slice(0, 1000) || null, due: d.due_date,
        tv: d.target_value ? Math.round(Number(d.target_value)) : null, u: String(d.target_unit ?? "").trim().slice(0, 40) || null,
        at: areaTypeOf(d.area_code), ac: d.area_code, by: viewer.id, name: viewer.name,
      },
    );
    for (const g of groups) run("INSERT INTO task_assignments (id, task_id, assignee_type, assignee_id) VALUES (:id, :t, 'group', :g)", { id: uuid(), t: id, g: g.id });
  });
  for (const g of groups) {
    const leader = one("SELECT phone_enc FROM group_leaders WHERE group_id = :g AND position = 'coordinator' LIMIT 1", { g: g.id });
    if (leader) await send({ to: open(leader.phone_enc), template: "task_assigned", vars: { task: title.slice(0, 50), due: d.due_date, link: `${SITE}/workspace/tasks` } });
  }
  return { id, assigned: groups.length };
}

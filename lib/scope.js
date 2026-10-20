import { statesInZone } from "./geo.js";

/**
 * Access follows the geography (spec §2). Every list, count and record that
 * reaches a coordinator goes through `scopeSql`, so a page and the API behind
 * it are limited by the same clause, and a direct URL to a record outside the
 * viewer's area finds nothing.
 *
 * A person can hold several roles; their scope is the union of all of them.
 */

const POWERS = {
  group_coordinator: ["workspace", "approve_members", "log_activity", "upload_media", "report_task", "view_media"],
  ward_coordinator: ["workspace", "verify", "assign_tasks", "assign_agents", "log_activity", "upload_media", "moderate_media", "view_media", "election"],
  lga_coordinator: ["workspace", "verify", "assign_tasks", "assign_agents", "log_activity", "upload_media", "moderate_media", "view_media", "message", "election"],
  state_coordinator: ["workspace", "verify", "approve_state_groups", "assign_tasks", "assign_agents", "log_activity", "upload_media", "moderate_media", "view_media", "message", "request_export", "election"],
  zonal_coordinator: ["workspace", "verify", "approve_state_groups", "assign_tasks", "view_media", "message", "request_export", "moderate_media", "election"],
  directorate_head: ["workspace", "message", "view_media", "summary_only"],
  national_admin: [
    "workspace", "verify", "approve_state_groups", "assign_tasks", "assign_agents", "log_activity", "upload_media",
    "moderate_media", "publicity", "view_media", "message", "request_export", "approve_export", "manage_users",
    "audit", "settings", "election", "approve_messages",
  ],
  dpo: ["workspace", "audit", "data_requests"],
  field_agent: ["workspace", "field_agent"],
};

export function powersFor(roles) {
  const set = new Set();
  for (const r of roles) for (const p of POWERS[r.role] ?? []) set.add(p);
  // Summary-only applies only when the directorate is the person's only view.
  if (set.has("summary_only") && roles.some((r) => !["directorate_head", "dpo"].includes(r.role))) set.delete("summary_only");
  return [...set];
}

/**
 * Column map per entity: which columns hold the state, LGA, ward and group.
 * `alias` lets callers use a table alias.
 */
const ENTITY = {
  group: { state: "state_code", lga: "lga_code", ward: "ward_code", group: "id", directorate: "directorate" },
  volunteer: { state: "vote_state_code", lga: "vote_lga_code", ward: "vote_ward_code", group: "group_id", agent: "registered_by_agent" },
  media: { state: "state_code", lga: "lga_code", ward: "ward_code", group: "group_id" },
  activity: { state: "state_code", lga: "lga_code", ward: "ward_code", group: "group_id" },
  incident: { state: "state_code", lga: "lga_code", ward: "ward_code" },
  result: { state: "state_code", lga: "lga_code", ward: "ward_code" },
};

let seq = 0;

/**
 * SQL fragment + params limiting `entity` rows to what the viewer may see.
 * Returns "0" (nothing) for a viewer with no applicable role.
 */
export function scopeSql(viewer, entity, alias = "") {
  const cols = ENTITY[entity];
  const p = alias ? `${alias}.` : "";
  const parts = [];
  const params = {};
  const param = (value) => {
    seq = (seq + 1) % 1e9;
    const name = `sc${seq}`;
    params[name] = value;
    return `:${name}`;
  };

  for (const r of viewer?.roles ?? []) {
    switch (r.role) {
      case "national_admin":
        return { sql: "1", params: {} };
      case "zonal_coordinator": {
        const codes = statesInZone(r.area_code);
        if (codes.length) parts.push(`${p}${cols.state} IN (${codes.map((c) => param(c)).join(",")})`);
        break;
      }
      case "state_coordinator":
        parts.push(`${p}${cols.state} = ${param(r.area_code)}`);
        break;
      case "lga_coordinator":
        if (cols.lga) parts.push(`${p}${cols.lga} = ${param(r.area_code)}`);
        break;
      case "ward_coordinator":
        if (cols.ward) parts.push(`${p}${cols.ward} = ${param(r.area_code)}`);
        break;
      case "group_coordinator":
        if (cols.group) parts.push(`${p}${cols.group} = ${param(r.area_code)}`);
        break;
      case "directorate_head":
        if (entity === "group") parts.push(`${p}directorate = ${param(r.area_code)}`);
        else if (cols.group) parts.push(`${p}${cols.group} IN (SELECT id FROM support_groups WHERE directorate = ${param(r.area_code)})`);
        break;
      case "field_agent":
        if (cols.agent) parts.push(`${p}${cols.agent} = ${param(viewer.id)}`);
        break;
      default:
        break;
    }
  }
  return { sql: parts.length ? `(${parts.join(" OR ")})` : "0", params };
}

/** True when a geography code is inside the viewer's coordinator area. */
export function coversArea(viewer, code) {
  for (const r of viewer?.roles ?? []) {
    if (r.role === "national_admin") return true;
    if (r.role === "zonal_coordinator" && statesInZone(r.area_code).includes(code.slice(0, 3))) return true;
    if (["state_coordinator", "lga_coordinator", "ward_coordinator"].includes(r.role) && code.startsWith(r.area_code)) return true;
  }
  return false;
}

/**
 * The widest single area the viewer coordinates, used as the dashboard's
 * starting point. National > zone > state > LGA > ward.
 */
export function homeArea(viewer) {
  const rank = { national_admin: 0, dpo: 0, zonal_coordinator: 1, state_coordinator: 2, directorate_head: 2, lga_coordinator: 3, ward_coordinator: 4, group_coordinator: 5, field_agent: 6 };
  const roles = [...(viewer?.roles ?? [])].sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9));
  const top = roles[0];
  if (!top) return null;
  if (["national_admin", "dpo"].includes(top.role)) return { type: "national", code: "NG" };
  if (top.role === "zonal_coordinator") return { type: "zone", code: top.area_code };
  if (top.role === "state_coordinator") return { type: "state", code: top.area_code };
  if (top.role === "lga_coordinator") return { type: "lga", code: top.area_code };
  if (top.role === "ward_coordinator") return { type: "ward", code: top.area_code };
  if (top.role === "directorate_head") return { type: "directorate", code: top.area_code };
  if (top.role === "group_coordinator") return { type: "group", code: top.area_code };
  return { type: "agent", code: viewer.id };
}

/** Area clause for dashboards: rows inside one geography code. */
export function areaSql(entity, areaType, areaCode, alias = "") {
  const cols = ENTITY[entity];
  const p = alias ? `${alias}.` : "";
  if (areaType === "national") return { sql: "1", params: {} };
  if (areaType === "zone") {
    const codes = statesInZone(areaCode);
    return { sql: `${p}${cols.state} IN (${codes.map((c) => `'${c}'`).join(",") || "''"})`, params: {} };
  }
  const col = { state: cols.state, lga: cols.lga, ward: cols.ward }[areaType];
  if (!col) return { sql: "1", params: {} };
  return { sql: `${p}${col} = :areaCode`, params: { areaCode } };
}

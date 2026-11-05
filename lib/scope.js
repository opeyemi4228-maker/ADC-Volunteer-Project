import { statesInZone } from "./geo.js";
import { POSITION_KEYS, ALL_WIDGETS, positionPowers, resolveAccess } from "./positions.js";

/**
 * Who can see and do what.
 *
 *   super_admin  The supervising body. Sees every record nationwide and can
 *                do everything: verify, tasks, media, messages, exports,
 *                accounts, positions, data requests and election day.
 *   positions    Ward, LGA, state and zonal coordinators, directorate heads
 *                and field agents (lib/positions.js). Each holds one area and
 *                opens the tabs and dashboard widgets the Super Admin has
 *                switched on for that position. Records stay inside the area.
 *   volunteer    A volunteer's own account: their dashboard, tasks, activity
 *                reports, photos, messages, ID card and certificate. Never
 *                anyone else's data.
 *
 * Every workspace list, count and record goes through `scopeSql`, so a page
 * and the API behind it are limited by the same clause, and a direct URL to a
 * record outside the viewer's area finds nothing. A person can hold several
 * roles; their scope is the union of all of them.
 */

const SUPER_ADMIN = [
  "workspace", "verify", "assign_tasks", "assign_agents", "log_activity", "upload_media", "moderate_media", "publicity",
  "view_media", "message", "request_export", "approve_export", "manage_users", "audit", "settings", "election",
  "approve_messages", "data_requests", "manage_volunteers", "view_volunteers", "view_map", "manage_training",
];

/** The stored name of the Super Admin role before it was renamed; kept so an unmigrated account still works. */
const LEGACY_SUPER = "national_admin";

export const ROLES = ["super_admin", ...POSITION_KEYS, "volunteer"];

const superRole = (role) => role === "super_admin" || role === LEGACY_SUPER;

/** Powers for a set of role assignments. `access` is the resolved position access (lib/positions.js). */
export function powersFor(roles, access = resolveAccess()) {
  const set = new Set();
  for (const r of roles) {
    const list = superRole(r.role) ? SUPER_ADMIN
      : r.role === "volunteer" ? ["volunteer"]
        : access[r.role] ? positionPowers(access[r.role].features) : [];
    for (const p of list) set.add(p);
  }
  // Names-only applies only when no role held shows phone numbers.
  const showsPhones = (r) => {
    if (superRole(r.role)) return true;
    const f = access[r.role]?.features ?? [];
    return f.includes("volunteers") && f.includes("contact");
  };
  if (roles.some(showsPhones)) set.delete("summary_only");
  return [...set];
}

/** Dashboard widgets the viewer is shown: all of them for the Super Admin, otherwise those switched on for their positions. */
export function widgetsFor(roles, access = resolveAccess()) {
  if (roles.some((r) => superRole(r.role))) return ALL_WIDGETS;
  const set = new Set();
  for (const r of roles) for (const w of access[r.role]?.widgets ?? []) set.add(w);
  return ALL_WIDGETS.filter((w) => set.has(w));
}

/** True for a volunteer's own account (not the supervising body). */
export const isVolunteerOnly = (viewer) => viewer.roles.length > 0 && viewer.roles.every((r) => r.role === "volunteer");

export const isSuperAdmin = (viewer) => Boolean(viewer?.roles?.some((r) => superRole(r.role)));

/**
 * Column map per entity: which columns hold the state, LGA, ward and group.
 * `alias` lets callers use a table alias.
 */
const ENTITY = {
  group: { state: "state_code", lga: "lga_code", ward: "ward_code", group: "id" },
  volunteer: { state: "vote_state_code", lga: "vote_lga_code", ward: "vote_ward_code", group: "group_id", agent: "registered_by_agent" },
  media: { state: "state_code", lga: "lga_code", ward: "ward_code", group: "group_id" },
  activity: { state: "state_code", lga: "lga_code", ward: "ward_code", group: "group_id" },
  incident: { state: "state_code", lga: "lga_code", ward: "ward_code" },
  result: { state: "state_code", lga: "lga_code", ward: "ward_code" },
};

let seq = 0;

/** SQL fragment + params limiting `entity` rows to what the viewer may see in the workspace. */
export function scopeSql(viewer, entity, alias = "") {
  if (isSuperAdmin(viewer)) return { sql: "TRUE", params: {} };
  const cols = ENTITY[entity] ?? {};
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
      case "zonal_coordinator": {
        const codes = statesInZone(r.area_code);
        if (codes.length && cols.state) parts.push(`${p}${cols.state} IN (${codes.map((c) => param(c)).join(",")})`);
        break;
      }
      case "state_coordinator":
        if (cols.state) parts.push(`${p}${cols.state} = ${param(r.area_code)}`);
        break;
      case "lga_coordinator":
        if (cols.lga) parts.push(`${p}${cols.lga} = ${param(r.area_code)}`);
        break;
      case "ward_coordinator":
        if (cols.ward) parts.push(`${p}${cols.ward} = ${param(r.area_code)}`);
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
  return { sql: parts.length ? `(${parts.join(" OR ")})` : "FALSE", params };
}

/** True when a geography code is inside what the viewer oversees. */
export function coversArea(viewer, code) {
  if (isSuperAdmin(viewer)) return true;
  for (const r of viewer?.roles ?? []) {
    if (r.role === "zonal_coordinator" && statesInZone(r.area_code).includes(String(code).slice(0, 3))) return true;
    if (["state_coordinator", "lga_coordinator", "ward_coordinator"].includes(r.role) && String(code).startsWith(r.area_code)) return true;
  }
  return false;
}

/**
 * Where the viewer's dashboard starts: the widest area they hold.
 * National (Super Admin) > zone > state > directorate > LGA > ward > field agent > volunteer.
 */
export function homeArea(viewer) {
  if (isSuperAdmin(viewer)) return { type: "national", code: "NG" };
  const rank = { zonal_coordinator: 1, state_coordinator: 2, directorate_head: 3, lga_coordinator: 4, ward_coordinator: 5, field_agent: 6, volunteer: 7 };
  const top = [...(viewer?.roles ?? [])].filter((r) => rank[r.role]).sort((a, b) => rank[a.role] - rank[b.role])[0];
  if (!top) return null;
  if (top.role === "zonal_coordinator") return { type: "zone", code: top.area_code };
  if (top.role === "state_coordinator") return { type: "state", code: top.area_code };
  if (top.role === "lga_coordinator") return { type: "lga", code: top.area_code };
  if (top.role === "ward_coordinator") return { type: "ward", code: top.area_code };
  if (top.role === "directorate_head") return { type: "directorate", code: top.area_code };
  if (top.role === "volunteer") return { type: "volunteer", code: top.area_code };
  return { type: "agent", code: viewer.id };
}

/** Area clause for dashboards: rows inside one geography code. */
export function areaSql(entity, areaType, areaCode, alias = "") {
  const cols = ENTITY[entity];
  const p = alias ? `${alias}.` : "";
  if (areaType === "national") return { sql: "TRUE", params: {} };
  if (areaType === "zone") {
    const codes = statesInZone(areaCode);
    return { sql: `${p}${cols.state} IN (${codes.map((c) => `'${c}'`).join(",") || "''"})`, params: {} };
  }
  const col = { state: cols.state, lga: cols.lga, ward: cols.ward }[areaType];
  if (!col) return { sql: "TRUE", params: {} };
  return { sql: `${p}${col} = :areaCode`, params: { areaCode } };
}

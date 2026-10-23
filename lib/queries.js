import { all, scalar } from "./db.js";
import { scopeSql } from "./scope.js";
import { placeLabel, areaName } from "./geo.js";
import { GROUP_CATEGORIES, GROUP_SIZE, labelOf } from "./options.js";

/**
 * Read-side queries shared by the coordinator API and pages. Coordinator
 * lists always pass through `scopeSql`, so a viewer only ever sees rows in
 * their own area; the public directory shows verified groups and no contacts.
 */

const PAGE_SIZE = 50;

function page(q) {
  const p = Math.max(1, Number.parseInt(q.page, 10) || 1);
  return { limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE, page: p };
}

/** Area filter on top of the scope: `area` may be a state, LGA or ward code. */
function areaFilter(code, cols, params) {
  if (!code) return null;
  params.area = code;
  if (code.length === 3) return `${cols.state} = :area`;
  if (code.length === 7) return `${cols.lga} = :area`;
  return `${cols.ward} = :area`;
}

export function listGroups(viewer, q = {}) {
  const scope = scopeSql(viewer, "group", "g");
  const params = { ...scope.params };
  const where = [scope.sql];
  const area = areaFilter(q.lga || q.state || q.area, { state: "g.state_code", lga: "g.lga_code", ward: "g.ward_code" }, params);
  if (area) where.push(area);
  if (q.status) {
    where.push("g.status = :status");
    params.status = q.status;
  }
  if (q.category) {
    where.push("g.category = :category");
    params.category = q.category;
  }
  if (q.q) {
    where.push("(g.name LIKE :q OR g.public_id LIKE :q)");
    params.q = `%${String(q.q).trim()}%`;
  }
  const clause = where.join(" AND ");
  const { limit, offset, page: p } = page(q);
  const rows = all(
    `SELECT g.id, g.public_id, g.name, g.category, g.operating_level, g.estimated_size_range, g.state_code, g.lga_code, g.ward_code,
            g.status, g.created_at,
            (SELECT COUNT(*) FROM volunteers v WHERE v.group_id = g.id) AS members
       FROM support_groups g WHERE ${clause}
      ORDER BY g.created_at DESC LIMIT :limit OFFSET :offset`,
    { ...params, limit, offset },
  );
  return {
    total: scalar(`SELECT COUNT(*) FROM support_groups g WHERE ${clause}`, params),
    page: p,
    pageSize: limit,
    groups: rows.map((g) => ({
      ...g,
      place: placeLabel(g),
      categoryLabel: labelOf(GROUP_CATEGORIES, g.category),
      sizeLabel: labelOf(GROUP_SIZE, g.estimated_size_range),
    })),
  };
}

export function listVolunteers(viewer, q = {}) {
  const scope = scopeSql(viewer, "volunteer", "v");
  const params = { ...scope.params };
  const where = [scope.sql];
  const area = areaFilter(q.area, { state: "v.vote_state_code", lga: "v.vote_lga_code", ward: "v.vote_ward_code" }, params);
  if (area) where.push(area);
  if (q.status) {
    where.push("v.status = :status");
    params.status = q.status;
  }
  if (q.pvc) {
    where.push("v.pvc_status = :pvc");
    params.pvc = q.pvc;
  }
  if (q.role) {
    where.push("EXISTS (SELECT 1 FROM volunteer_roles r WHERE r.volunteer_id = v.id AND r.role = :role)");
    params.role = q.role;
  }
  if (q.q) {
    where.push("(v.first_name LIKE :q OR v.surname LIKE :q OR v.public_id LIKE :q)");
    params.q = `%${String(q.q).trim()}%`;
  }
  const clause = where.join(" AND ");
  const { limit, offset, page: p } = page(q);
  const rows = all(
    `SELECT v.id, v.public_id, v.first_name, v.surname, v.gender, v.vote_state_code, v.vote_lga_code, v.vote_ward_code,
            v.pvc_status, v.status, v.created_at, g.name AS group_name
       FROM volunteers v LEFT JOIN support_groups g ON g.id = v.group_id
      WHERE ${clause} ORDER BY v.created_at DESC LIMIT :limit OFFSET :offset`,
    { ...params, limit, offset },
  );
  return {
    total: scalar(`SELECT COUNT(*) FROM volunteers v WHERE ${clause}`, params),
    page: p,
    pageSize: limit,
    volunteers: rows.map((v) => ({
      ...v,
      place: placeLabel({ state_code: v.vote_state_code, lga_code: v.vote_lga_code, ward_code: v.vote_ward_code }),
    })),
  };
}

/** Verified groups for the public directory: names and places, never contacts. */
export function publicGroups(q = {}) {
  const params = {};
  const where = ["status = 'verified'"];
  const area = areaFilter(q.lga || q.state, { state: "state_code", lga: "lga_code", ward: "ward_code" }, params);
  if (area) where.push(area);
  if (q.category) {
    where.push("category = :category");
    params.category = q.category;
  }
  if (q.q) {
    where.push("name LIKE :q");
    params.q = `%${String(q.q).trim().slice(0, 100)}%`;
  }
  const clause = where.join(" AND ");
  const { limit, offset, page: p } = page(q);
  const rows = all(
    `SELECT public_id, name, category, operating_level, estimated_size_range, state_code, lga_code, ward_code, join_code, date_formed
       FROM support_groups WHERE ${clause} ORDER BY name LIMIT :limit OFFSET :offset`,
    { ...params, limit, offset },
  );
  return {
    total: scalar(`SELECT COUNT(*) FROM support_groups WHERE ${clause}`, params),
    page: p,
    pageSize: limit,
    groups: rows.map((g) => ({
      ...g,
      place: placeLabel(g),
      categoryLabel: labelOf(GROUP_CATEGORIES, g.category),
      sizeLabel: labelOf(GROUP_SIZE, g.estimated_size_range),
    })),
  };
}

/** Headline counts for a coordinator, limited to their scope. */
export function scopedSummary(viewer) {
  const g = scopeSql(viewer, "group");
  const v = scopeSql(viewer, "volunteer");
  const count = (table, s, extra = "1") => scalar(`SELECT COUNT(*) FROM ${table} WHERE ${s.sql} AND ${extra}`, s.params);
  return {
    groups: count("support_groups", g),
    groupsVerified: count("support_groups", g, "status = 'verified'"),
    groupsPending: count("support_groups", g, "status IN ('pending','info_requested')"),
    volunteers: count("volunteers", v),
    volunteersVerified: count("volunteers", v, "status = 'verified'"),
    volunteersPending: count("volunteers", v, "status = 'pending'"),
    withPvc: count("volunteers", v, "pvc_status = 'yes'"),
  };
}

export { areaName };

/**
 * Public "momentum" for the home page, safe to show anyone: verified
 * volunteers only (nothing a visitor can seed), grouped by LGA and by week,
 * and only for LGAs with at least MIN_LGA verified volunteers so no one person
 * can be singled out (political affiliation is sensitive data under the NDPA).
 */
const MIN_LGA = 10;

export function publicMomentum({ days = 7, limit = 6 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString().replace("T", " ").slice(0, 19);
  const rows = all(
    `SELECT v.vote_lga_code AS lga, v.vote_state_code AS state, COUNT(*) AS recent,
            (SELECT COUNT(*) FROM volunteers x WHERE x.vote_lga_code = v.vote_lga_code AND x.status = 'verified') AS total
       FROM volunteers v
      WHERE v.status = 'verified' AND v.created_at >= :since
      GROUP BY v.vote_lga_code
     HAVING total >= :min
      ORDER BY recent DESC, total DESC
      LIMIT :limit`,
    { since, min: MIN_LGA, limit },
  );
  const byState = all(
    `SELECT vote_state_code AS state, COUNT(*) AS n FROM volunteers
      WHERE status = 'verified' AND created_at >= :since GROUP BY vote_state_code`,
    { since },
  );
  return {
    lgas: rows.map((r) => ({ ...r, lgaName: areaName(r.lga), stateName: areaName(r.state) })),
    recentByState: Object.fromEntries(byState.map((r) => [r.state, r.n])),
    thisWeek: byState.reduce((n, r) => n + r.n, 0),
  };
}

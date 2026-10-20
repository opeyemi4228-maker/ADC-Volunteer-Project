import { all, one, scalar } from "./db.js";
import { open } from "./crypto.js";
import { scopeSql, areaSql } from "./scope.js";
import { areaName, placeLabel, unitCount, childAreas, stateList, stateTree, lgaOf } from "./geo.js";
import { formatPhone, maskPhone } from "./validate.js";
import { GROUP_SIZE_MID } from "./options.js";

/**
 * Read models for the coordinator workspace: record profiles, verification
 * queues, the dashboard and the coverage map. Everything goes through
 * `scopeSql(viewer, …)`, so a page, an API response and a direct URL are all
 * limited by the same clause.
 */

const PAGE = 25;

function where(parts) {
  const list = parts.filter(Boolean);
  const sql = list.filter((p) => p.sql !== "1").map((p) => p.sql);
  const params = Object.assign({}, ...list.map((p) => p.params));
  return { sql: sql.length ? `WHERE ${sql.join(" AND ")}` : "", params };
}
const and = (w, extra) => (w.sql ? `${w.sql} AND ${extra}` : `WHERE ${extra}`);

function areaFilter(entity, code, alias) {
  if (!code) return null;
  const type = code.length === 2 ? "zone" : { 3: "state", 7: "lga", 10: "ward" }[code.length];
  if (!type) return null;
  const a = areaSql(entity, type, code, alias);
  return { sql: a.sql.replace(":areaCode", ":afArea"), params: a.params.areaCode ? { afArea: code } : {} };
}

/* ── Queues and directories ────────────────────────────────────────────── */

export function groupRows(viewer, f = {}) {
  const parts = [scopeSql(viewer, "group", "g")];
  if (f.status) parts.push({ sql: "g.status = :status", params: { status: f.status } });
  if (f.queue) parts.push({ sql: "g.status IN ('pending','info_requested')", params: {} });
  if (f.category) parts.push({ sql: "g.category = :category", params: { category: f.category } });
  if (f.level) parts.push({ sql: "g.operating_level = :level", params: { level: f.level } });
  if (f.area) parts.push(areaFilter("group", f.area, "g"));
  if (f.q) parts.push({ sql: "(g.name LIKE :q OR g.public_id LIKE :q OR g.join_code LIKE :q)", params: { q: `%${String(f.q).trim()}%` } });
  const w = where(parts);
  const page = Math.max(1, Number(f.page) || 1);
  const rows = all(
    `SELECT g.id, g.public_id, g.name, g.category, g.operating_level, g.status, g.state_code, g.lga_code, g.ward_code,
       g.estimated_size_range, g.created_at, g.has_online_platform, g.join_code, g.directorate,
       (SELECT COUNT(*) FROM volunteers v WHERE v.group_id = g.id AND v.status = 'verified') AS verified_members,
       (SELECT COUNT(*) FROM duplicate_flags d WHERE d.entity_type = 'group' AND d.entity_id = g.id AND d.resolved_at IS NULL) AS flags,
       (SELECT COUNT(*) FROM media_items m WHERE m.group_id = g.id) AS media
     FROM support_groups g ${w.sql} ORDER BY ${f.queue ? "g.created_at ASC" : "g.created_at DESC"} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
    w.params,
  );
  const total = scalar(`SELECT COUNT(*) FROM support_groups g ${w.sql}`, w.params);
  return { rows: rows.map((r) => ({ ...r, place: placeLabel(r) })), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
}

export function volunteerRows(viewer, f = {}) {
  const parts = [scopeSql(viewer, "volunteer", "v")];
  if (f.status) parts.push({ sql: "v.status = :status", params: { status: f.status } });
  if (f.queue) parts.push({ sql: "v.status IN ('pending','info_requested')", params: {} });
  if (f.pvc) parts.push({ sql: "v.pvc_status = :pvc", params: { pvc: f.pvc } });
  if (f.role) parts.push({ sql: "EXISTS (SELECT 1 FROM volunteer_roles r WHERE r.volunteer_id = v.id AND r.role = :role)", params: { role: f.role } });
  if (f.channel) parts.push({ sql: "v.registration_channel = :channel", params: { channel: f.channel } });
  if (f.group) parts.push({ sql: "v.group_id = :group", params: { group: f.group } });
  if (f.nopu) parts.push({ sql: "v.vote_pu_code IS NULL", params: {} });
  if (f.unaffiliated) parts.push({ sql: "v.group_id IS NULL", params: {} });
  if (f.flagged) parts.push({ sql: "EXISTS (SELECT 1 FROM duplicate_flags d WHERE d.entity_type = 'volunteer' AND d.entity_id = v.id AND d.resolved_at IS NULL)", params: {} });
  if (f.area) parts.push(areaFilter("volunteer", f.area, "v"));
  if (f.q) parts.push({ sql: "(v.first_name || ' ' || v.surname LIKE :q OR v.public_id LIKE :q)", params: { q: `%${String(f.q).trim()}%` } });
  const w = where(parts);
  const page = Math.max(1, Number(f.page) || 1);
  const rows = all(
    `SELECT v.id, v.public_id, v.first_name, v.middle_name, v.surname, v.gender, v.status, v.pvc_status, v.vote_state_code, v.vote_lga_code,
       v.vote_ward_code, v.vote_pu_code, v.registration_channel, v.created_at, v.phone_verified_at, v.has_smartphone, v.availability,
       g.name AS group_name, g.public_id AS group_public_id,
       (SELECT GROUP_CONCAT(role) FROM volunteer_roles r WHERE r.volunteer_id = v.id) AS roles,
       (SELECT COUNT(*) FROM duplicate_flags d WHERE d.entity_type = 'volunteer' AND d.entity_id = v.id AND d.resolved_at IS NULL) AS flags
     FROM volunteers v LEFT JOIN support_groups g ON g.id = v.group_id ${w.sql}
     ORDER BY ${f.queue ? "v.created_at ASC" : "v.created_at DESC"} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
    w.params,
  );
  const total = scalar(`SELECT COUNT(*) FROM volunteers v ${w.sql}`, w.params);
  return {
    rows: rows.map((r) => ({ ...r, roles: r.roles ? r.roles.split(",") : [], place: placeLabel({ state_code: r.vote_state_code, lga_code: r.vote_lga_code, ward_code: r.vote_ward_code }) })),
    total, page, pages: Math.max(1, Math.ceil(total / PAGE)),
  };
}

/* ── Profiles ──────────────────────────────────────────────────────────── */

export function getGroup(viewer, id) {
  const s = scopeSql(viewer, "group", "g");
  const g = one(`SELECT g.* FROM support_groups g WHERE (g.id = :gid OR g.public_id = :gid) AND ${s.sql}`, { gid: id, ...s.params });
  if (!g) return null;
  const summary = viewer.powers.includes("summary_only");
  const leaders = all("SELECT * FROM group_leaders WHERE group_id = :id ORDER BY sort", { id: g.id }).map((l) => {
    const phone = open(l.phone_enc);
    return {
      id: l.id, position: l.position, position_other: l.position_other, first_name: l.first_name, surname: l.surname, gender: l.gender,
      phone: phone ? (summary ? maskPhone(phone) : formatPhone(phone)) : "", phoneE164: summary ? null : phone, email: summary ? "" : open(l.email_enc),
    };
  });
  const members = all(
    `SELECT id, public_id, first_name, surname, status, group_status, vote_ward_code, vote_pu_code, pvc_status, created_at
     FROM volunteers WHERE group_id = :id ORDER BY created_at DESC`,
    { id: g.id },
  );
  const verifiedMembers = members.filter((m) => m.status === "verified").length;
  const platforms = all("SELECT * FROM group_online_platforms WHERE group_id = :id", { id: g.id }).map((p) => ({ ...p, platform_types: JSON.parse(p.platform_types) }));
  const social = all("SELECT network, handle, url, label FROM social_accounts WHERE owner_type = 'group' AND owner_id = :id", { id: g.id });
  const media = all("SELECT * FROM media_items WHERE group_id = :id ORDER BY created_at DESC", { id: g.id }).map((m) => ({ ...m, place: placeLabel(m) }));
  const activities = all("SELECT * FROM activities WHERE group_id = :id ORDER BY date DESC LIMIT 50", { id: g.id });
  const tasks = all(
    `SELECT t.*, a.status AS assignment_status,
       (SELECT COALESCE(SUM(achieved_value),0) FROM task_reports r WHERE r.task_id = t.id) AS achieved
     FROM task_assignments a JOIN tasks t ON t.id = a.task_id WHERE a.assignee_type = 'group' AND a.assignee_id = :id ORDER BY t.due_date`,
    { id: g.id },
  );
  const areas = all("SELECT area_type, area_code FROM group_areas_covered WHERE group_id = :id", { id: g.id }).map((a) => ({ ...a, name: areaName(a.area_code) }));
  const flags = all(
    `SELECT d.*, o.name AS other_name, o.public_id AS other_public_id FROM duplicate_flags d LEFT JOIN support_groups o ON o.id = d.other_id
     WHERE d.entity_type = 'group' AND d.entity_id = :id`,
    { id: g.id },
  );
  const history = all("SELECT * FROM audit_log WHERE entity = 'group' AND entity_id = :id ORDER BY id DESC LIMIT 50", { id: g.id });
  const consents = all("SELECT consent_type, granted, notice_version, channel, captured_at FROM consents WHERE subject_type = 'group' AND subject_id = :id", { id: g.id });
  const recentActivities = activities.filter((a) => Date.now() - Date.parse(a.date) < 30 * 86400000).length;
  const approvedMedia = media.filter((m) => ["approved", "publicity"].includes(m.moderation_status)).length;
  const reportedTasks = tasks.filter((t) => t.achieved > 0).length;
  return {
    ...g,
    registrant_hash: undefined,
    place: placeLabel(g),
    leaders, members, verifiedMembers, platforms, social, media, activities, tasks, areas, flags, history, consents,
    health: healthScore(g, { verifiedMembers, recentActivities, approvedMedia, tasks: tasks.length, reportedTasks, platforms: platforms.length, social: social.length, leaders: leaders.length }),
  };
}

/**
 * Group health 0–100 (spec §9.3). Online presence and media add points, but
 * their absence never blocks verification.
 */
export function healthScore(g, x) {
  const expected = GROUP_SIZE_MID[g.estimated_size_range] ?? 50;
  const parts = {
    members: Math.round(Math.min(1, x.verifiedMembers / Math.max(10, expected * 0.3)) * 30),
    activity: Math.min(25, x.recentActivities * 8),
    tasks: x.tasks ? Math.round((x.reportedTasks / x.tasks) * 15) : 8,
    media: Math.min(10, x.approvedMedia * 4),
    profile: Math.round(([g.description, g.address, g.cac_status, x.leaders >= 3, g.date_formed].filter(Boolean).length / 5) * 12),
    online: x.platforms || x.social ? 8 : 0,
  };
  return { score: Math.min(100, Object.values(parts).reduce((a, b) => a + b, 0)), parts };
}

export function getVolunteer(viewer, id) {
  const s = scopeSql(viewer, "volunteer", "v");
  const v = one(`SELECT v.* FROM volunteers v WHERE (v.id = :vid OR v.public_id = :vid) AND ${s.sql}`, { vid: id, ...s.params });
  if (!v) return null;
  const summary = viewer.powers.includes("summary_only");
  const phone = open(v.phone_enc);
  const { phone_enc: _p, email_enc: _e, phone_hash: _h, ...rest } = v;
  return {
    ...rest,
    phone: summary ? maskPhone(phone) : formatPhone(phone),
    phoneE164: summary ? null : phone,
    email: summary ? "" : open(v.email_enc),
    place: placeLabel({ state_code: v.vote_state_code, lga_code: v.vote_lga_code, ward_code: v.vote_ward_code }),
    pu_name: v.vote_pu_code ? areaName(v.vote_pu_code) : null,
    residence: v.res_state_code ? placeLabel({ state_code: v.res_state_code, lga_code: v.res_lga_code, ward_code: v.res_ward_code }) : null,
    group: v.group_id ? one("SELECT id, public_id, name, join_code FROM support_groups WHERE id = :id", { id: v.group_id }) : null,
    roles: all("SELECT role FROM volunteer_roles WHERE volunteer_id = :id", { id: v.id }).map((r) => r.role),
    languages: all("SELECT language FROM volunteer_languages WHERE volunteer_id = :id", { id: v.id }).map((r) => r.language),
    social: all("SELECT network, handle, url FROM social_accounts WHERE owner_type = 'volunteer' AND owner_id = :id", { id: v.id }),
    flags: all(
      `SELECT d.*, o.first_name || ' ' || o.surname AS other_name, o.public_id AS other_public_id FROM duplicate_flags d
       LEFT JOIN volunteers o ON o.id = d.other_id WHERE d.entity_type = 'volunteer' AND d.entity_id = :id`,
      { id: v.id },
    ),
    consents: all("SELECT consent_type, granted, notice_version, channel, captured_at FROM consents WHERE subject_type = 'volunteer' AND subject_id = :id", { id: v.id }),
    agent: all("SELECT * FROM pu_agents WHERE volunteer_id = :id", { id: v.id }),
    history: all("SELECT * FROM audit_log WHERE entity = 'volunteer' AND entity_id = :id ORDER BY id DESC LIMIT 30", { id: v.id }),
  };
}

/* ── Dashboard ─────────────────────────────────────────────────────────── */

function scoped(viewer, entity, areaType, areaCode, alias = "") {
  const s = scopeSql(viewer, entity, alias);
  const a = ["national", "zone", "state", "lga", "ward"].includes(areaType) ? areaSql(entity, areaType, areaCode, alias) : null;
  return where([s, a]);
}

export function dashboard(viewer, areaType, areaCode) {
  const V = scoped(viewer, "volunteer", areaType, areaCode);
  const G = scoped(viewer, "group", areaType, areaCode);
  const M = scoped(viewer, "media", areaType, areaCode);

  const volunteers = scalar(`SELECT COUNT(*) FROM volunteers ${V.sql}`, V.params);
  const verified = scalar(`SELECT COUNT(*) FROM volunteers ${and(V, "status = 'verified'")}`, V.params);
  const pvcReady = scalar(`SELECT COUNT(*) FROM volunteers ${and(V, "pvc_status = 'yes'")}`, V.params);
  const withPu = scalar(`SELECT COUNT(*) FROM volunteers ${and(V, "vote_pu_code IS NOT NULL")}`, V.params);
  const pusCovered = scalar(`SELECT COUNT(DISTINCT vote_pu_code) FROM volunteers ${and(V, "vote_pu_code IS NOT NULL AND status != 'rejected'")}`, V.params);
  const pusWithAgent = scalar(`SELECT COUNT(DISTINCT pu_code) FROM pu_agents WHERE volunteer_id IN (SELECT id FROM volunteers ${V.sql})`, V.params);
  const geoArea = ["national", "zone", "state", "lga", "ward"].includes(areaType);
  const totalPus = geoArea ? unitCount(areaType, areaCode) : null;
  const groupsVerified = scalar(`SELECT COUNT(*) FROM support_groups ${and(G, "status = 'verified'")}`, G.params);
  const groupsTotal = scalar(`SELECT COUNT(*) FROM support_groups ${and(G, "status != 'rejected'")}`, G.params);
  const pendingVolunteers = scalar(`SELECT COUNT(*) FROM volunteers ${and(V, "status IN ('pending','info_requested')")}`, V.params);
  const pendingGroups = scalar(`SELECT COUNT(*) FROM support_groups ${and(G, "status IN ('pending','info_requested')")}`, G.params);
  const pendingMedia = scalar(`SELECT COUNT(*) FROM media_items ${and(M, "moderation_status = 'pending'")}`, M.params);
  const overdue = scalar(`SELECT COUNT(*) FROM volunteers ${and(V, "status = 'pending' AND created_at < datetime('now','-7 days')")}`, V.params)
    + scalar(`SELECT COUNT(*) FROM support_groups ${and(G, "status = 'pending' AND created_at < datetime('now','-7 days')")}`, G.params);

  const daily = all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM volunteers ${and(V, "created_at >= date('now', '-89 days')")} GROUP BY day`,
    V.params,
  );
  const byDay = new Map(daily.map((d) => [d.day, d.n]));
  let running = scalar(`SELECT COUNT(*) FROM volunteers ${and(V, "created_at < date('now', '-89 days')")}`, V.params);
  const series = [];
  for (let i = 89; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    running += byDay.get(day) ?? 0;
    series.push({ day, n: byDay.get(day) ?? 0, total: running });
  }

  const channels = all(`SELECT registration_channel AS channel, COUNT(*) AS n FROM volunteers ${V.sql} GROUP BY channel ORDER BY n DESC`, V.params);
  const roles = all(
    `SELECT role, COUNT(*) AS n FROM volunteer_roles WHERE volunteer_id IN (SELECT id FROM volunteers ${and(V, "status != 'rejected'")}) GROUP BY role ORDER BY n DESC`,
    V.params,
  );

  const children = geoArea ? childAreas(areaType, areaCode).filter((c) => c.type !== "pu") : [];
  const type = children[0]?.type;
  const vKey = { state: "vote_state_code", lga: "vote_lga_code", ward: "vote_ward_code" }[type];
  const gKey = { state: "state_code", lga: "lga_code", ward: "ward_code" }[type];
  let table = [];
  if (vKey) {
    const vs = new Map(
      all(
        `SELECT ${vKey} AS code, COUNT(*) AS registered, SUM(status = 'verified') AS verified, SUM(pvc_status = 'yes') AS pvc,
           COUNT(DISTINCT vote_pu_code) AS pus FROM volunteers ${V.sql} GROUP BY ${vKey}`,
        V.params,
      ).map((r) => [r.code, r]),
    );
    const gs = new Map(all(`SELECT ${gKey} AS code, COUNT(*) AS n FROM support_groups ${and(G, "status = 'verified'")} GROUP BY ${gKey}`, G.params).map((r) => [r.code, r.n]));
    table = children.map((c) => {
      const s = vs.get(c.code) ?? {};
      return { ...c, registered: s.registered ?? 0, verified: s.verified ?? 0, pvc: s.pvc ?? 0, groups: gs.get(c.code) ?? 0, pus: s.pus ?? 0, totalPus: unitCount(c.type, c.code) };
    });
  }

  return {
    area: { type: areaType, code: areaCode, name: geoArea ? areaName(areaCode) : areaType === "group" ? "My group" : areaCode },
    volunteers, verified, pvcReady, withPu, pusCovered, pusWithAgent, totalPus, groupsVerified, groupsTotal,
    pendingVolunteers, pendingGroups, pendingMedia, overdue, wardsWithoutGroup: geoArea ? wardsWithoutGroup(areaType, areaCode) : null,
    series, channels, roles, table,
    agentsAvailable: roles.find((r) => r.role === "pu_agent")?.n ?? 0,
  };
}

/** Wards in an area with no verified group based in or covering them. */
export function wardsWithoutGroup(areaType, areaCode) {
  const codes = areaType === "national" ? stateList.map((s) => s.code) : areaType === "zone" ? stateList.filter((s) => s.zone === areaCode).map((s) => s.code) : [areaCode.slice(0, 3)];
  let wards = codes.flatMap((c) => stateTree(c).lgas.flatMap((l) => l.wards.map((w) => w.code)));
  if (areaType === "lga") wards = lgaOf(areaCode).wards.map((w) => w.code);
  if (areaType === "ward") wards = [areaCode];
  const verified = all("SELECT id, operating_level, state_code, lga_code, ward_code FROM support_groups WHERE status = 'verified'");
  const coveredWards = new Set(verified.filter((g) => g.ward_code && g.operating_level === "ward").map((g) => g.ward_code));
  const coveredLgas = new Set(verified.filter((g) => g.operating_level === "lga").map((g) => g.lga_code));
  const coveredStates = new Set(verified.filter((g) => ["state", "zonal", "national"].includes(g.operating_level)).map((g) => g.state_code));
  for (const a of all("SELECT a.area_type, a.area_code FROM group_areas_covered a JOIN support_groups g ON g.id = a.group_id WHERE g.status = 'verified'")) {
    if (a.area_type === "ward") coveredWards.add(a.area_code);
    if (a.area_type === "lga") coveredLgas.add(a.area_code);
  }
  // A state-wide group is not local cover for every ward; only ward and LGA groups count.
  void coveredStates;
  return wards.filter((w) => !coveredWards.has(w) && !coveredLgas.has(w.slice(0, 7))).length;
}

/** Per-state (national/zone) or per-LGA (state) values for the coverage map. */
export function coverage(viewer, areaType, areaCode) {
  const level = areaType === "national" || areaType === "zone" ? "state" : "lga";
  const key = level === "state" ? "vote_state_code" : "vote_lga_code";
  const V = scoped(viewer, "volunteer", areaType, areaCode);
  const rows = new Map(
    all(
      `SELECT ${key} AS code, COUNT(*) AS volunteers, SUM(status = 'verified') AS verified, SUM(pvc_status = 'yes') AS pvc,
         COUNT(DISTINCT vote_pu_code) AS pus FROM volunteers ${V.sql} GROUP BY ${key}`,
      V.params,
    ).map((r) => [r.code, r]),
  );
  const G = scoped(viewer, "group", areaType, areaCode);
  const gKey = level === "state" ? "state_code" : "lga_code";
  const groups = new Map(all(`SELECT ${gKey} AS code, COUNT(*) AS n FROM support_groups ${and(G, "status = 'verified'")} GROUP BY ${gKey}`, G.params).map((r) => [r.code, r.n]));
  const areas = level === "state"
    ? stateList.filter((s) => areaType === "national" || s.zone === areaCode).map((s) => ({ code: s.code, name: s.name }))
    : stateTree(areaCode.slice(0, 3)).lgas.filter((l) => areaType === "state" || l.code === areaCode.slice(0, 7)).map((l) => ({ code: l.code, name: l.name }));
  return {
    level,
    values: areas.map((a) => {
      const r = rows.get(a.code) ?? { volunteers: 0, verified: 0, pvc: 0, pus: 0 };
      const totalPus = unitCount(level, a.code);
      return { ...a, ...r, code: a.code, groups: groups.get(a.code) ?? 0, totalPus, pvcRate: r.volunteers ? r.pvc / r.volunteers : 0, puRate: totalPus ? r.pus / totalPus : 0 };
    }),
  };
}

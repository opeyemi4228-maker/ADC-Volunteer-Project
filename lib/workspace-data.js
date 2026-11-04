import { all, one, scalar } from "./db.js";
import { scopeSql, areaSql } from "./scope.js";
import { areaName, placeLabel, unitCount, childAreas, stateList, stateTree, lgaOf } from "./geo.js";
import { open, blind } from "./crypto.js";
import { formatPhone, maskPhone, normalizePhone, ageOn } from "./validate.js";
import { GROUP_SIZE_MID, AGE_BANDS } from "./options.js";

/**
 * Read models for the coordinator workspace: record profiles, verification
 * queues, the dashboard and the coverage map. Everything goes through
 * `scopeSql(viewer, …)`, so a page, an API response and a direct URL are all
 * limited by the same clause.
 */

const PAGE = 25;

function where(parts) {
  const list = parts.filter(Boolean);
  const sql = list.filter((p) => p.sql !== "TRUE").map((p) => p.sql);
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

export async function groupRows(viewer, f = {}) {
  const parts = [scopeSql(viewer, "group", "g")];
  if (f.status) parts.push({ sql: "g.status = :status", params: { status: f.status } });
  if (f.queue) parts.push({ sql: "g.status IN ('pending','info_requested')", params: {} });
  if (f.category) parts.push({ sql: "g.category = :category", params: { category: f.category } });
  if (f.level) parts.push({ sql: "g.operating_level = :level", params: { level: f.level } });
  if (f.area) parts.push(areaFilter("group", f.area, "g"));
  if (f.q) parts.push({ sql: "(g.name ILIKE :q OR g.public_id ILIKE :q OR g.join_code ILIKE :q)", params: { q: `%${String(f.q).trim()}%` } });
  const w = where(parts);
  const page = Math.max(1, Number(f.page) || 1);
  const totalP = scalar(`SELECT COUNT(*) FROM support_groups g ${w.sql}`, w.params);
  totalP.catch(() => {}); // awaited below; this only stops an early failure being reported as unhandled
  const rows = await all(
    `SELECT g.id, g.public_id, g.name, g.category, g.operating_level, g.status, g.state_code, g.lga_code, g.ward_code,
       g.estimated_size_range, g.created_at, g.has_online_platform, g.join_code, g.directorate,
       (SELECT COUNT(*) FROM volunteers v WHERE v.group_id = g.id AND v.status = 'verified') AS verified_members,
       (SELECT COUNT(*) FROM duplicate_flags d WHERE d.entity_type = 'group' AND d.entity_id = g.id AND d.resolved_at IS NULL) AS flags,
       (SELECT COUNT(*) FROM media_items m WHERE m.group_id = g.id) AS media
     FROM support_groups g ${w.sql} ORDER BY ${f.queue ? "g.created_at ASC" : "g.created_at DESC"} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
    w.params,
  );
  const total = await totalP;
  return { rows: rows.map((r) => ({ ...r, place: placeLabel(r) })), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
}

const SORTS = {
  newest: "v.created_at DESC",
  oldest: "v.created_at ASC",
  name: "lower(v.surname) ASC, lower(v.first_name) ASC",
  name_desc: "lower(v.surname) DESC, lower(v.first_name) DESC",
  place: "v.vote_state_code, v.vote_lga_code, v.vote_ward_code, lower(v.surname)",
  place_desc: "v.vote_state_code DESC, v.vote_lga_code DESC, v.vote_ward_code DESC, lower(v.surname)",
  status: "CASE v.status WHEN 'pending' THEN 0 WHEN 'info_requested' THEN 1 WHEN 'verified' THEN 2 ELSE 3 END, v.created_at ASC",
};
export const PAGE_SIZES = [25, 50, 100];
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

/**
 * The WHERE clause behind the volunteer directory, its counts and its
 * downloads, so the three always agree. `f` is the page's query string.
 * `except` leaves filters out (the status tabs count across every status).
 */
export function volunteerWhere(viewer, f = {}, { except = [] } = {}) {
  const has = (k) => f[k] && !except.includes(k);
  const parts = [scopeSql(viewer, "volunteer", "v")];
  if (has("status")) parts.push({ sql: "v.status = :status", params: { status: f.status } });
  if (has("queue")) parts.push({ sql: "v.status IN ('pending','info_requested')", params: {} });
  if (has("pvc")) parts.push({ sql: "v.pvc_status = :pvc", params: { pvc: f.pvc } });
  if (has("role")) parts.push({ sql: "EXISTS (SELECT 1 FROM volunteer_roles r WHERE r.volunteer_id = v.id AND r.role = :role)", params: { role: f.role } });
  if (has("language")) parts.push({ sql: "EXISTS (SELECT 1 FROM volunteer_languages l WHERE l.volunteer_id = v.id AND l.language = :lang)", params: { lang: f.language } });
  if (has("channel")) parts.push({ sql: "v.registration_channel = :channel", params: { channel: f.channel } });
  if (has("gender")) parts.push({ sql: "v.gender = :gender", params: { gender: f.gender } });
  if (has("availability")) parts.push({ sql: "v.availability = :avail", params: { avail: f.availability } });
  if (has("smartphone")) parts.push({ sql: "v.has_smartphone = :smart", params: { smart: f.smartphone === "yes" ? 1 : 0 } });
  if (has("phone")) parts.push({ sql: f.phone === "confirmed" ? "v.phone_verified_at IS NOT NULL" : "v.phone_verified_at IS NULL", params: {} });
  if (has("age")) {
    const b = AGE_BANDS.find((x) => x.value === f.age);
    if (b) parts.push({ sql: "v.date_of_birth <= current_date - make_interval(years => :ageMin::int) AND v.date_of_birth > current_date - make_interval(years => :ageMax::int)", params: { ageMin: b.min, ageMax: b.max + 1 } });
  }
  if (has("from") && isDay(f.from)) parts.push({ sql: "v.created_at >= :from::date", params: { from: f.from } });
  if (has("to") && isDay(f.to)) parts.push({ sql: "v.created_at < :to::date + 1", params: { to: f.to } });
  if (has("group")) parts.push({ sql: "v.group_id = :group", params: { group: f.group } });
  if (has("nopu")) parts.push({ sql: "v.vote_pu_code IS NULL", params: {} });
  if (has("unaffiliated")) parts.push({ sql: "v.group_id IS NULL", params: {} });
  if (has("affiliation")) parts.push({ sql: f.affiliation === "none" ? "v.group_id IS NULL" : "v.group_id IS NOT NULL", params: {} });
  if (has("flagged")) parts.push({ sql: "EXISTS (SELECT 1 FROM duplicate_flags d WHERE d.entity_type = 'volunteer' AND d.entity_id = v.id AND d.resolved_at IS NULL)", params: {} });
  if (has("area")) parts.push(areaFilter("volunteer", f.area, "v"));
  if (has("ids")) {
    const ids = String(f.ids).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1000);
    const params = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
    parts.push({ sql: ids.length ? `v.id IN (${ids.map((_, i) => `:id${i}`).join(",")})` : "FALSE", params });
  }
  if (has("q")) {
    // A phone number finds the volunteer through the keyed hash; it is never stored in clear.
    const phone = normalizePhone(f.q);
    parts.push(phone
      ? { sql: "v.phone_hash = :qPhone", params: { qPhone: blind(phone) } }
      : { sql: "(v.first_name || ' ' || v.surname ILIKE :q OR v.surname || ' ' || v.first_name ILIKE :q OR v.public_id ILIKE :q)", params: { q: `%${String(f.q).trim()}%` } });
  }
  return where(parts);
}

export async function volunteerRows(viewer, f = {}) {
  const w = volunteerWhere(viewer, f);
  const page = Math.max(1, Number(f.page) || 1);
  const per = PAGE_SIZES.includes(Number(f.per)) ? Number(f.per) : PAGE;
  const order = SORTS[f.sort] ?? (f.queue ? SORTS.oldest : SORTS.newest);
  const summary = viewer.powers.includes("summary_only");
  // The page of rows and the total are fetched together.
  const totalP = scalar(`SELECT COUNT(*) FROM volunteers v ${w.sql}`, w.params);
  totalP.catch(() => {}); // awaited below; this only stops an early failure being reported as unhandled
  const rows = await all(
    `SELECT v.id, v.public_id, v.first_name, v.middle_name, v.surname, v.gender, v.date_of_birth, v.status, v.pvc_status, v.vote_state_code, v.vote_lga_code,
       v.vote_ward_code, v.vote_pu_code, v.registration_channel, v.created_at, v.phone_verified_at, v.has_smartphone, v.availability, v.phone_enc,
       g.name AS group_name, g.public_id AS group_public_id,
       (SELECT string_agg(role, ',' ORDER BY role) FROM volunteer_roles r WHERE r.volunteer_id = v.id) AS roles,
       (SELECT COUNT(*) FROM duplicate_flags d WHERE d.entity_type = 'volunteer' AND d.entity_id = v.id AND d.resolved_at IS NULL) AS flags
     FROM volunteers v LEFT JOIN support_groups g ON g.id = v.group_id ${w.sql}
     ORDER BY ${order} LIMIT ${per} OFFSET ${(page - 1) * per}`,
    w.params,
  );
  const total = await totalP;
  return {
    rows: rows.map(({ phone_enc, ...r }) => ({
      ...r,
      // The directory shows a masked number; the full one is on the profile, where viewing it is audit-logged.
      phone: phone_enc && !summary ? maskPhone(open(phone_enc)) : "",
      age: r.date_of_birth ? ageOn(r.date_of_birth) : null,
      roles: r.roles ? r.roles.split(",") : [],
      place: placeLabel({ state_code: r.vote_state_code, lga_code: r.vote_lga_code, ward_code: r.vote_ward_code }),
      ward_name: areaName(r.vote_ward_code),
      lga_name: areaName(r.vote_lga_code),
      state_name: areaName(r.vote_state_code),
      pu_name: r.vote_pu_code ? areaName(r.vote_pu_code) : null,
    })),
    total, page, per, pages: Math.max(1, Math.ceil(total / per)),
  };
}

/** Counts for the directory header: by status (ignoring the status filter) and for the current selection. */
export async function volunteerSummary(viewer, f = {}) {
  const tabsW = volunteerWhere(viewer, f, { except: ["status", "queue"] });
  const w = volunteerWhere(viewer, f);
  const [statuses, s] = await Promise.all([all(`SELECT v.status, COUNT(*) AS n FROM volunteers v ${tabsW.sql} GROUP BY v.status`, tabsW.params), one(
    `SELECT COUNT(*) AS total, count(*) FILTER (WHERE v.pvc_status = 'yes') AS pvc, count(*) FILTER (WHERE v.vote_pu_code IS NULL) AS nopu,
       count(*) FILTER (WHERE v.phone_verified_at IS NOT NULL) AS "phoneConfirmed", count(*) FILTER (WHERE v.created_at >= now() - interval '7 days') AS new7,
       count(*) FILTER (WHERE v.gender = 'male') AS male, count(*) FILTER (WHERE v.gender = 'female') AS female,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM volunteer_roles r WHERE r.volunteer_id = v.id AND r.role = 'pu_agent')) AS agents
     FROM volunteers v ${w.sql}`,
    w.params,
  )]);
  const byStatus = Object.fromEntries(statuses.map((r) => [r.status, r.n]));
  return { ...s, byStatus, all: Object.values(byStatus).reduce((a, b) => a + b, 0) };
}

/**
 * Full rows for a download, place names resolved. Records with a pending
 * deletion request, and records already anonymised, are left out.
 */
export async function volunteerExport(viewer, f = {}, { limit = 100000 } = {}) {
  const w = volunteerWhere(viewer, f);
  const order = SORTS[f.sort] ?? SORTS.place;
  const rows = await all(
    `SELECT v.*, g.name AS group_name, g.public_id AS group_public_id,
       (SELECT string_agg(role, ',' ORDER BY role) FROM volunteer_roles r WHERE r.volunteer_id = v.id) AS roles,
       (SELECT string_agg(language, ',' ORDER BY language) FROM volunteer_languages l WHERE l.volunteer_id = v.id) AS languages
     FROM volunteers v LEFT JOIN support_groups g ON g.id = v.group_id ${and(w, "v.deletion_requested_at IS NULL AND v.phone_hash NOT LIKE 'deleted:%'")}
     ORDER BY ${order} LIMIT ${Number(limit) || 100000}`,
    w.params,
  );
  return rows.map(({ phone_enc, email_enc, phone_hash: _h, ...v }) => ({
    ...v,
    phone: open(phone_enc),
    email: open(email_enc),
    roles: v.roles ? v.roles.split(",") : [],
    languages: v.languages ? v.languages.split(",") : [],
    state_name: areaName(v.vote_state_code),
    lga_name: areaName(v.vote_lga_code),
    ward_name: areaName(v.vote_ward_code),
    pu_name: v.vote_pu_code ? areaName(v.vote_pu_code) : "",
  }));
}

/* ── Profiles ──────────────────────────────────────────────────────────── */

export async function getGroup(viewer, id) {
  const s = scopeSql(viewer, "group", "g");
  const g = await one(`SELECT g.* FROM support_groups g WHERE (g.id = :gid OR g.public_id = :gid) AND ${s.sql}`, { gid: id, ...s.params });
  if (!g) return null;
  const summary = viewer.powers.includes("summary_only");
  const leaders = (await all("SELECT * FROM group_leaders WHERE group_id = :id ORDER BY sort", { id: g.id })).map((l) => {
    const phone = open(l.phone_enc);
    return {
      id: l.id, position: l.position, position_other: l.position_other, first_name: l.first_name, surname: l.surname, gender: l.gender,
      phone: phone ? (summary ? maskPhone(phone) : formatPhone(phone)) : "", phoneE164: summary ? null : phone, email: summary ? "" : open(l.email_enc),
    };
  });
  const members = await all(
    `SELECT id, public_id, first_name, surname, status, group_status, vote_ward_code, vote_pu_code, pvc_status, created_at
     FROM volunteers WHERE group_id = :id ORDER BY created_at DESC`,
    { id: g.id },
  );
  const verifiedMembers = members.filter((m) => m.status === "verified").length;
  const platforms = (await all("SELECT * FROM group_online_platforms WHERE group_id = :id", { id: g.id })).map((p) => ({ ...p, platform_types: JSON.parse(p.platform_types) }));
  const social = await all("SELECT network, handle, url, label FROM social_accounts WHERE owner_type = 'group' AND owner_id = :id", { id: g.id });
  const media = (await all("SELECT * FROM media_items WHERE group_id = :id ORDER BY created_at DESC", { id: g.id })).map((m) => ({ ...m, place: placeLabel(m) }));
  const activities = await all("SELECT * FROM activities WHERE group_id = :id ORDER BY date DESC LIMIT 50", { id: g.id });
  const tasks = await all(
    `SELECT t.*, a.status AS assignment_status,
       (SELECT COALESCE(SUM(achieved_value),0) FROM task_reports r WHERE r.task_id = t.id) AS achieved
     FROM task_assignments a JOIN tasks t ON t.id = a.task_id WHERE a.assignee_type = 'group' AND a.assignee_id = :id ORDER BY t.due_date`,
    { id: g.id },
  );
  const areas = (await all("SELECT area_type, area_code FROM group_areas_covered WHERE group_id = :id", { id: g.id })).map((a) => ({ ...a, name: areaName(a.area_code) }));
  const flags = await all(
    `SELECT d.*, o.name AS other_name, o.public_id AS other_public_id FROM duplicate_flags d LEFT JOIN support_groups o ON o.id = d.other_id
     WHERE d.entity_type = 'group' AND d.entity_id = :id`,
    { id: g.id },
  );
  const history = await all("SELECT * FROM audit_log WHERE entity = 'group' AND entity_id = :id ORDER BY id DESC LIMIT 50", { id: g.id });
  const consents = await all("SELECT consent_type, granted, notice_version, channel, captured_at FROM consents WHERE subject_type = 'group' AND subject_id = :id", { id: g.id });
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

export async function getVolunteer(viewer, id) {
  const s = scopeSql(viewer, "volunteer", "v");
  const v = await one(`SELECT v.* FROM volunteers v WHERE (v.id = :vid OR v.public_id = :vid) AND ${s.sql}`, { vid: id, ...s.params });
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
    group: v.group_id ? await one("SELECT id, public_id, name, join_code FROM support_groups WHERE id = :id", { id: v.group_id }) : null,
    roles: (await all("SELECT role FROM volunteer_roles WHERE volunteer_id = :id", { id: v.id })).map((r) => r.role),
    languages: (await all("SELECT language FROM volunteer_languages WHERE volunteer_id = :id", { id: v.id })).map((r) => r.language),
    social: await all("SELECT network, handle, url FROM social_accounts WHERE owner_type = 'volunteer' AND owner_id = :id", { id: v.id }),
    flags: await all(
      `SELECT d.*, o.first_name || ' ' || o.surname AS other_name, o.public_id AS other_public_id FROM duplicate_flags d
       LEFT JOIN volunteers o ON o.id = d.other_id WHERE d.entity_type = 'volunteer' AND d.entity_id = :id`,
      { id: v.id },
    ),
    consents: await all("SELECT consent_type, granted, notice_version, channel, captured_at FROM consents WHERE subject_type = 'volunteer' AND subject_id = :id", { id: v.id }),
    agent: await all("SELECT * FROM pu_agents WHERE volunteer_id = :id", { id: v.id }),
    history: await all("SELECT * FROM audit_log WHERE entity = 'volunteer' AND entity_id = :id ORDER BY id DESC LIMIT 30", { id: v.id }),
  };
}

/* ── Dashboard ─────────────────────────────────────────────────────────── */

function scoped(viewer, entity, areaType, areaCode, alias = "") {
  const s = scopeSql(viewer, entity, alias);
  const a = ["national", "zone", "state", "lga", "ward"].includes(areaType) ? areaSql(entity, areaType, areaCode, alias) : null;
  return where([s, a]);
}

export async function dashboard(viewer, areaType, areaCode) {
  const V = scoped(viewer, "volunteer", areaType, areaCode);
  const G = scoped(viewer, "group", areaType, areaCode);
  const M = scoped(viewer, "media", areaType, areaCode);
  const geoArea = ["national", "zone", "state", "lga", "ward"].includes(areaType);
  const children = geoArea ? childAreas(areaType, areaCode).filter((c) => c.type !== "pu") : [];
  const type = children[0]?.type;
  const vKey = { state: "vote_state_code", lga: "vote_lga_code", ward: "vote_ward_code" }[type];
  const gKey = { state: "state_code", lga: "lga_code", ward: "ward_code" }[type];
  // Bands are fixed values from options.js, so they are written into the SQL directly.
  const band = `CASE ${AGE_BANDS.map((b) => `WHEN date_of_birth > current_date - interval '${b.max + 1} years' THEN '${b.value}'`).join(" ")} ELSE '${AGE_BANDS.at(-1).value}' END`;

  // Every query below is independent, so they run at the same time; the
  // headline figures come from one pass over the volunteers table.
  const [v, g, pendingMedia, pusWithAgent, daily, verifiedDaily, genders, statuses, ageRows, channels, roles, vs, gs] = await Promise.all([
    one(
      `SELECT COUNT(*) AS volunteers,
         count(*) FILTER (WHERE status = 'verified') AS verified,
         count(*) FILTER (WHERE pvc_status = 'yes') AS "pvcReady",
         count(*) FILTER (WHERE vote_pu_code IS NOT NULL) AS "withPu",
         COUNT(DISTINCT vote_pu_code) FILTER (WHERE status != 'rejected') AS "pusCovered",
         count(*) FILTER (WHERE status IN ('pending','info_requested')) AS "pendingVolunteers",
         count(*) FILTER (WHERE status = 'pending' AND created_at < now() - interval '7 days') AS overdue,
         min(created_at) FILTER (WHERE status IN ('pending','info_requested')) AS "oldestPending",
         count(*) FILTER (WHERE created_at < current_date - 89) AS before90,
         count(*) FILTER (WHERE created_at >= current_date) AS today,
         count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS d7,
         count(*) FILTER (WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days') AS p7,
         count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS d30,
         count(*) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS p30,
         count(*) FILTER (WHERE verified_at >= now() - interval '7 days') AS verified7,
         count(*) FILTER (WHERE verified_at >= now() - interval '14 days' AND verified_at < now() - interval '7 days') AS "verifiedP7"
       FROM volunteers ${V.sql}`,
      V.params,
    ),
    one(
      `SELECT count(*) FILTER (WHERE status = 'verified') AS "groupsVerified",
         count(*) FILTER (WHERE status != 'rejected') AS "groupsTotal",
         count(*) FILTER (WHERE status IN ('pending','info_requested')) AS "pendingGroups",
         count(*) FILTER (WHERE status = 'pending' AND created_at < now() - interval '7 days') AS overdue
       FROM support_groups ${G.sql}`,
      G.params,
    ),
    scalar(`SELECT COUNT(*) FROM media_items ${and(M, "moderation_status = 'pending'")}`, M.params),
    scalar(`SELECT COUNT(DISTINCT pu_code) FROM pu_agents WHERE volunteer_id IN (SELECT id FROM volunteers ${V.sql})`, V.params),
    all(`SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS n FROM volunteers ${and(V, "created_at >= current_date - 89")} GROUP BY day`, V.params),
    all(`SELECT to_char(verified_at, 'YYYY-MM-DD') AS day, COUNT(*) AS n FROM volunteers ${and(V, "verified_at >= current_date - 89")} GROUP BY day`, V.params),
    all(`SELECT gender, COUNT(*) AS n FROM volunteers ${V.sql} GROUP BY gender`, V.params),
    all(`SELECT status, COUNT(*) AS n FROM volunteers ${V.sql} GROUP BY status`, V.params),
    all(`SELECT ${band} AS band, COUNT(*) AS n FROM volunteers ${V.sql} GROUP BY band`, V.params),
    all(`SELECT registration_channel AS channel, COUNT(*) AS n FROM volunteers ${V.sql} GROUP BY channel ORDER BY n DESC`, V.params),
    all(
      `SELECT role, COUNT(*) AS n FROM volunteer_roles WHERE volunteer_id IN (SELECT id FROM volunteers ${and(V, "status != 'rejected'")}) GROUP BY role ORDER BY n DESC`,
      V.params,
    ),
    vKey
      ? all(
        `SELECT ${vKey} AS code, COUNT(*) AS registered, count(*) FILTER (WHERE status = 'verified') AS verified, count(*) FILTER (WHERE pvc_status = 'yes') AS pvc,
           count(*) FILTER (WHERE status IN ('pending','info_requested')) AS waiting, COUNT(DISTINCT vote_pu_code) AS pus FROM volunteers ${V.sql} GROUP BY ${vKey}`,
        V.params,
      )
      : [],
    gKey ? all(`SELECT ${gKey} AS code, COUNT(*) AS n FROM support_groups ${and(G, "status = 'verified'")} GROUP BY ${gKey}`, G.params) : [],
  ]);

  const byDay = new Map(daily.map((d) => [d.day, d.n]));
  const verifiedByDay = new Map(verifiedDaily.map((r) => [r.day, r.n]));
  let running = v.before90;
  const series = [];
  for (let i = 89; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    running += byDay.get(day) ?? 0;
    series.push({ day, n: byDay.get(day) ?? 0, total: running, verified: verifiedByDay.get(day) ?? 0 });
  }
  const ageMap = new Map(ageRows.map((r) => [r.band, r.n]));
  const vsMap = new Map(vs.map((r) => [r.code, r]));
  const gsMap = new Map(gs.map((r) => [r.code, r.n]));
  const table = vKey
    ? children.map((c) => {
      const r = vsMap.get(c.code) ?? {};
      return { ...c, registered: r.registered ?? 0, verified: r.verified ?? 0, pvc: r.pvc ?? 0, waiting: r.waiting ?? 0, groups: gsMap.get(c.code) ?? 0, pus: r.pus ?? 0, totalPus: unitCount(c.type, c.code) };
    })
    : [];

  return {
    area: { type: areaType, code: areaCode, name: geoArea ? areaName(areaCode) : areaType === "group" ? "My group" : areaCode },
    volunteers: v.volunteers, verified: v.verified, pvcReady: v.pvcReady, withPu: v.withPu, pusCovered: v.pusCovered, pusWithAgent,
    totalPus: geoArea ? unitCount(areaType, areaCode) : null,
    groupsVerified: g.groupsVerified, groupsTotal: g.groupsTotal, pendingVolunteers: v.pendingVolunteers, pendingGroups: g.pendingGroups,
    pendingMedia, overdue: v.overdue + g.overdue, oldestPending: v.oldestPending,
    series, channels, roles, table,
    growth: { today: v.today, d7: v.d7, p7: v.p7, d30: v.d30, p30: v.p30, verified7: v.verified7, verifiedP7: v.verifiedP7 },
    genders, ages: AGE_BANDS.map((b) => ({ ...b, n: ageMap.get(b.value) ?? 0 })),
    byStatus: Object.fromEntries(statuses.map((r) => [r.status, r.n])),
    agentsAvailable: roles.find((r) => r.role === "pu_agent")?.n ?? 0,
  };
}

/** Wards in an area with no verified group based in or covering them. */
export async function wardsWithoutGroup(areaType, areaCode) {
  const codes = areaType === "national" ? stateList.map((s) => s.code) : areaType === "zone" ? stateList.filter((s) => s.zone === areaCode).map((s) => s.code) : [areaCode.slice(0, 3)];
  let wards = codes.flatMap((c) => stateTree(c).lgas.flatMap((l) => l.wards.map((w) => w.code)));
  if (areaType === "lga") wards = lgaOf(areaCode).wards.map((w) => w.code);
  if (areaType === "ward") wards = [areaCode];
  const verified = await all("SELECT id, operating_level, state_code, lga_code, ward_code FROM support_groups WHERE status = 'verified'");
  const coveredWards = new Set(verified.filter((g) => g.ward_code && g.operating_level === "ward").map((g) => g.ward_code));
  const coveredLgas = new Set(verified.filter((g) => g.operating_level === "lga").map((g) => g.lga_code));
  const coveredStates = new Set(verified.filter((g) => ["state", "zonal", "national"].includes(g.operating_level)).map((g) => g.state_code));
  for (const a of await all("SELECT a.area_type, a.area_code FROM group_areas_covered a JOIN support_groups g ON g.id = a.group_id WHERE g.status = 'verified'")) {
    if (a.area_type === "ward") coveredWards.add(a.area_code);
    if (a.area_type === "lga") coveredLgas.add(a.area_code);
  }
  // A state-wide group is not local cover for every ward; only ward and LGA groups count.
  void coveredStates;
  return wards.filter((w) => !coveredWards.has(w) && !coveredLgas.has(w.slice(0, 7))).length;
}

/** Per-state (national/zone) or per-LGA (state) values for the coverage map. */
export async function coverage(viewer, areaType, areaCode) {
  const level = areaType === "national" || areaType === "zone" ? "state" : "lga";
  const key = level === "state" ? "vote_state_code" : "vote_lga_code";
  const V = scoped(viewer, "volunteer", areaType, areaCode);
  const rows = new Map(
    (await all(
      `SELECT ${key} AS code, COUNT(*) AS volunteers, count(*) FILTER (WHERE status = 'verified') AS verified, count(*) FILTER (WHERE pvc_status = 'yes') AS pvc,
         COUNT(DISTINCT vote_pu_code) AS pus FROM volunteers ${V.sql} GROUP BY ${key}`,
      V.params,
    )).map((r) => [r.code, r]),
  );
  const G = scoped(viewer, "group", areaType, areaCode);
  const gKey = level === "state" ? "state_code" : "lga_code";
  const groups = new Map((await all(`SELECT ${gKey} AS code, COUNT(*) AS n FROM support_groups ${and(G, "status = 'verified'")} GROUP BY ${gKey}`, G.params)).map((r) => [r.code, r.n]));
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

/* ── Administration (national admin) ───────────────────────────────────── */

/** Approvals waiting, the team behind the workspace and the latest audit entries. */
export async function adminOverview() {
  const [waiting, users, roles, failedSignins, recent] = await Promise.all([
    one(
      `SELECT (SELECT COUNT(*) FROM exports WHERE status = 'awaiting_approval') AS exports,
         (SELECT COUNT(*) FROM messages WHERE status = 'awaiting_approval') AS messages,
         (SELECT COUNT(*) FROM data_requests WHERE status = 'open') AS "dataRequests"`,
    ),
    one(`SELECT count(*) FILTER (WHERE active = 1) AS users, count(*) FILTER (WHERE active = 1 AND last_signin_at >= now() - interval '7 days') AS active7 FROM users`),
    all(
      `SELECT r.role, COUNT(DISTINCT r.user_id) AS n FROM role_assignments r JOIN users u ON u.id = r.user_id
       WHERE u.active = 1 AND r.role != 'volunteer' GROUP BY r.role ORDER BY n DESC`,
    ),
    scalar(`SELECT COUNT(*) FROM audit_log WHERE action = 'signin_failed' AND "timestamp" >= now() - interval '1 day'`),
    // Sign-ins and record views are kept in the audit log but would drown out the actions worth seeing here.
    all(`SELECT actor_name, action, entity, "timestamp", details FROM audit_log WHERE action NOT IN ('signin', 'signin_failed', 'view', 'seed') ORDER BY id DESC LIMIT 8`),
  ]);
  return { approvals: waiting, team: { ...users, roles }, failedSignins, recent };
}

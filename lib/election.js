import { all, one, run, getSetting, nowIso } from "./db.js";
import { uuid } from "./crypto.js";
import { scopeSql, coversArea } from "./scope.js";
import { puOf, wardUnits, areaName } from "./geo.js";
import { PARTIES, ELECTION_INCIDENTS, SEVERITY } from "./options.js";

/**
 * Election-day module (spec §10): one primary and one backup agent per
 * polling unit, accreditation tracking, check-in, result capture from Form
 * EC8A with a second confirmation, incidents, and the situation room.
 * Planned now; check-in and result capture only work once it is switched on.
 */

export const isLive = () => getSetting("election_day_enabled", false) === true;

/** Volunteers who can be agents for a polling unit: pu_agent role, votes in that ward. */
export function eligibleAgents(viewer, wardCode) {
  const s = scopeSql(viewer, "volunteer", "v");
  return all(
    `SELECT v.id, v.public_id, v.first_name, v.surname, v.vote_pu_code, v.has_smartphone, v.status,
       (SELECT pu_code FROM pu_agents a WHERE a.volunteer_id = v.id) AS assigned
     FROM volunteers v WHERE ${s.sql} AND v.vote_ward_code = :w AND v.status != 'rejected'
       AND EXISTS (SELECT 1 FROM volunteer_roles r WHERE r.volunteer_id = v.id AND r.role = 'pu_agent')
     ORDER BY v.status = 'verified' DESC, v.has_smartphone DESC, v.first_name`,
    { ...s.params, w: wardCode },
  );
}

export function roster(viewer, wardCode) {
  const agents = all(
    `SELECT a.*, v.first_name, v.surname, v.public_id, v.has_smartphone, v.status AS volunteer_status
     FROM pu_agents a JOIN volunteers v ON v.id = a.volunteer_id WHERE a.pu_code LIKE :w || '-%'`,
    { w: wardCode },
  );
  const results = new Map(all("SELECT pu_code, confirmed_at FROM results WHERE ward_code = :w", { w: wardCode }).map((r) => [r.pu_code, r]));
  return wardUnits(wardCode).map((u) => ({
    ...u,
    primary: agents.find((a) => a.pu_code === u.code && !a.is_backup) ?? null,
    backup: agents.find((a) => a.pu_code === u.code && a.is_backup) ?? null,
    result: results.get(u.code) ?? null,
  }));
}

export function assignAgent(viewer, { pu, volunteerId, backup }) {
  if (!puOf(pu) || !coversArea(viewer, pu.slice(0, 10))) return { error: "Choose a polling unit in your area." };
  const s = scopeSql(viewer, "volunteer", "v");
  const v = one(`SELECT v.* FROM volunteers v WHERE v.id = :vid AND ${s.sql}`, { vid: volunteerId, ...s.params });
  if (!v) return { error: "Volunteer not found in your area." };
  if (v.vote_ward_code !== pu.slice(0, 10)) return { error: "Agents must vote in the same ward as the polling unit." };
  run("DELETE FROM pu_agents WHERE volunteer_id = :v", { v: v.id });
  run(
    `INSERT INTO pu_agents (pu_code, volunteer_id, is_backup, assigned_by) VALUES (:pu, :v, :b, :by)
     ON CONFLICT(pu_code, is_backup) DO UPDATE SET volunteer_id = :v, accreditation_status = 'not_started', checked_in_at = NULL, assigned_by = :by`,
    { pu, v: v.id, b: backup ? 1 : 0, by: viewer.id },
  );
  return { ok: true };
}

/** The polling unit a phone-verified volunteer is agent for, if any. */
export function agentFor(phoneHash) {
  const v = one("SELECT id, first_name, surname FROM volunteers WHERE phone_hash = :h", { h: phoneHash });
  if (!v) return null;
  const a = one("SELECT * FROM pu_agents WHERE volunteer_id = :v", { v: v.id });
  if (!a) return { volunteer: v, assignment: null };
  const result = one("SELECT * FROM results WHERE pu_code = :pu", { pu: a.pu_code });
  return {
    volunteer: v,
    assignment: { ...a, pu_name: areaName(a.pu_code), ward: areaName(a.pu_code.slice(0, 10)), lga: areaName(a.pu_code.slice(0, 7)) },
    result: result ? { ...result, party_votes: JSON.parse(result.party_votes) } : null,
  };
}

export function validateResult(d) {
  const e = {};
  const votes = {};
  for (const p of PARTIES) {
    const n = d.votes?.[p];
    if (n === "" || n == null) { votes[p] = 0; continue; }
    if (!Number.isInteger(Number(n)) || Number(n) < 0) e[`votes.${p}`] = "Whole numbers only.";
    votes[p] = Number(n);
  }
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  const acc = Number(d.accredited);
  if (d.accredited !== "" && d.accredited != null && total + Number(d.rejected || 0) > acc) e.accredited = "Votes cast are more than accredited voters. Check the sheet.";
  if (!d.sheet_upload_id) e.sheet = "Take a photo of the result sheet (Form EC8A).";
  return { e, votes };
}

export function incidentsIn(viewer, limit = 100) {
  const s = scopeSql(viewer, "incident", "i");
  return all(`SELECT i.* FROM incidents i WHERE ${s.sql} ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.created_at DESC LIMIT ${limit}`, s.params)
    .map((i) => ({ ...i, place: [i.pu_code && areaName(i.pu_code), areaName(i.ward_code), areaName(i.lga_code)].filter(Boolean).join(", ") }));
}

export function situation(viewer) {
  const s = scopeSql(viewer, "result", "r");
  const results = all(`SELECT r.* FROM results r WHERE ${s.sql}`, s.params).map((r) => ({ ...r, party_votes: JSON.parse(r.party_votes) }));
  const V = scopeSql(viewer, "volunteer", "v");
  const agents = all(`SELECT a.* FROM pu_agents a JOIN volunteers v ON v.id = a.volunteer_id WHERE ${V.sql}`, V.params);
  const rostered = new Set(agents.map((a) => a.pu_code));
  const checkedIn = new Set(agents.filter((a) => a.checked_in_at).map((a) => a.pu_code));
  const reported = new Set(results.map((r) => r.pu_code));
  const totals = Object.fromEntries(PARTIES.map((p) => [p, 0]));
  const confirmedTotals = Object.fromEntries(PARTIES.map((p) => [p, 0]));
  for (const r of results) for (const p of PARTIES) {
    totals[p] += r.party_votes[p] ?? 0;
    if (r.confirmed_at) confirmedTotals[p] += r.party_votes[p] ?? 0;
  }
  const byWard = new Map();
  for (const r of results) {
    const w = byWard.get(r.ward_code) ?? { code: r.ward_code, name: areaName(r.ward_code), lga: areaName(r.lga_code), reported: 0, confirmed: 0, votes: Object.fromEntries(PARTIES.map((p) => [p, 0])) };
    w.reported += 1;
    if (r.confirmed_at) w.confirmed += 1;
    for (const p of PARTIES) w.votes[p] += r.party_votes[p] ?? 0;
    byWard.set(r.ward_code, w);
  }
  const silent = [...rostered].filter((pu) => !reported.has(pu)).map((pu) => ({ pu, name: areaName(pu), checkedIn: checkedIn.has(pu) }));
  return {
    rostered: rostered.size, checkedIn: checkedIn.size, reported: reported.size, confirmed: results.filter((r) => r.confirmed_at).length,
    totals, confirmedTotals, wards: [...byWard.values()], silent, pending: results.filter((r) => !r.confirmed_at).map((r) => ({ ...r, name: areaName(r.pu_code) })),
  };
}

export { PARTIES, ELECTION_INCIDENTS, SEVERITY, uuid, nowIso };

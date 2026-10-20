import fs from "node:fs";
import path from "node:path";

import { states as STATES } from "./states.mjs";

/**
 * Server-side view of the INEC register in public/geo (37 states, 774 LGAs,
 * 8,809 wards, 176,623 polling units). The browser fetches the same files
 * directly; the server reads them to validate every location it is sent and to
 * put names on codes.
 *
 * Codes are hierarchical, which the access rules lean on:
 *   state  FCT
 *   LGA    FCT-002
 *   ward   FCT-002-09
 *   PU     FCT-002-09-005
 */

const GEO_DIR = path.join(process.cwd(), "public", "geo");

export const ZONES = {
  NC: "North Central",
  NE: "North East",
  NW: "North West",
  SE: "South East",
  SS: "South South",
  SW: "South West",
};

export const stateList = STATES.map((s) => ({ code: s.code, name: s.name, slug: s.slug, zone: s.zone, inec: s.inec }));
const stateByCode = new Map(stateList.map((s) => [s.code, s]));

const cache = globalThis.__adcGeo ?? (globalThis.__adcGeo = { states: new Map(), pus: new Map() });

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(GEO_DIR, file), "utf8"));
}

/** { code, name, lgas: [{ code, name, wards: [{ code, name, units }] }] } */
export function stateTree(stateCode) {
  const state = stateByCode.get(stateCode);
  if (!state) return null;
  if (!cache.states.has(stateCode)) {
    const raw = readJson(`${state.slug}.json`);
    const lgas = raw.lgas
      .map((l) => ({ code: l.code, name: l.name, wards: [...l.wards].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    cache.states.set(stateCode, { ...state, lgas });
  }
  return cache.states.get(stateCode);
}

/** Polling units of one LGA, keyed by ward number: { "09": [["005", "Name"], …] } */
export function lgaUnits(lgaCode) {
  if (!/^[A-Z]{3}-\d{3}$/.test(lgaCode ?? "")) return null;
  if (!cache.pus.has(lgaCode)) {
    try {
      cache.pus.set(lgaCode, readJson(`pu/${lgaCode}.json`));
    } catch {
      cache.pus.set(lgaCode, {});
    }
  }
  return cache.pus.get(lgaCode);
}

export function wardUnits(wardCode) {
  const [s, l, w] = (wardCode ?? "").split("-");
  const units = lgaUnits(`${s}-${l}`)?.[w] ?? [];
  return units.map(([n, name]) => ({ code: `${wardCode}-${n}`, name }));
}

export function stateOf(code) {
  return stateByCode.get(String(code ?? "").slice(0, 3)) ?? null;
}

export function lgaOf(code) {
  const tree = stateTree(String(code ?? "").slice(0, 3));
  const lgaCode = String(code ?? "").slice(0, 7);
  return tree?.lgas.find((l) => l.code === lgaCode) ?? null;
}

export function wardOf(code) {
  const lga = lgaOf(code);
  const wardCode = String(code ?? "").slice(0, 10);
  return lga?.wards.find((w) => w.code === wardCode) ?? null;
}

export function puOf(code) {
  if (!code) return null;
  return wardUnits(code.slice(0, 10)).find((u) => u.code === code) ?? null;
}

/** Human name for any geography code (state, LGA, ward, PU or zone). */
export function areaName(code) {
  if (!code) return "";
  if (ZONES[code]) return ZONES[code];
  if (code === "NG") return "Nigeria";
  if (code.length === 3) return stateOf(code)?.name ?? code;
  if (code.length === 7) return lgaOf(code)?.name ?? code;
  if (code.length === 10) return wardOf(code)?.name ?? code;
  return puOf(code)?.name ?? code;
}

/** "Kubwa, Bwari, Federal Capital Territory" */
export function placeLabel({ state_code, lga_code, ward_code }) {
  return [ward_code && areaName(ward_code), lga_code && areaName(lga_code), state_code && areaName(state_code)].filter(Boolean).join(", ");
}

/**
 * Validates a location. Every part must be a real combination from the
 * register: the LGA must be in the state, the ward in the LGA, and the polling
 * unit in the ward. Returns an error message or null.
 */
export function checkLocation({ state, lga, ward, pu }, { needLga = true, needWard = true } = {}) {
  if (!stateByCode.has(state)) return "Choose a state.";
  if (!lga) return needLga ? "Choose an LGA." : null;
  if (!lga.startsWith(`${state}-`) || !lgaOf(lga)) return "That LGA is not in the chosen state.";
  if (!ward) return needWard ? "Choose a ward." : null;
  if (!ward.startsWith(`${lga}-`) || !wardOf(ward)) return "That ward is not in the chosen LGA.";
  if (pu && (!pu.startsWith(`${ward}-`) || !puOf(pu))) return "That polling unit is not in the chosen ward.";
  return null;
}

export function statesInZone(zone) {
  return stateList.filter((s) => s.zone === zone).map((s) => s.code);
}

/** Total polling units inside an area, from the ward counts in the register. */
export function unitCount(areaType, areaCode) {
  const sum = (tree, filter) =>
    tree.lgas.reduce((n, l) => n + l.wards.filter((w) => filter(l, w)).reduce((m, w) => m + (w.units ?? 0), 0), 0);
  if (areaType === "national") return stateList.reduce((n, s) => n + sum(stateTree(s.code), () => true), 0);
  if (areaType === "zone") return statesInZone(areaCode).reduce((n, c) => n + sum(stateTree(c), () => true), 0);
  const tree = stateTree(areaCode.slice(0, 3));
  if (!tree) return 0;
  if (areaType === "state") return sum(tree, () => true);
  if (areaType === "lga") return sum(tree, (l) => l.code === areaCode);
  if (areaType === "ward") return sum(tree, (l, w) => w.code === areaCode);
  return 0;
}

/** The children of an area, for drill-down tables. */
export function childAreas(areaType, areaCode) {
  if (areaType === "national") return stateList.map((s) => ({ type: "state", code: s.code, name: s.name }));
  if (areaType === "zone") return stateList.filter((s) => s.zone === areaCode).map((s) => ({ type: "state", code: s.code, name: s.name }));
  if (areaType === "state") return (stateTree(areaCode)?.lgas ?? []).map((l) => ({ type: "lga", code: l.code, name: l.name }));
  if (areaType === "lga") return (lgaOf(areaCode)?.wards ?? []).map((w) => ({ type: "ward", code: w.code, name: w.name }));
  if (areaType === "ward") return wardUnits(areaCode).map((u) => ({ type: "pu", code: u.code, name: u.name }));
  return [];
}

export function areaTypeOf(code) {
  if (!code || code === "NG") return "national";
  if (ZONES[code]) return "zone";
  return { 3: "state", 7: "lga", 10: "ward" }[code.length] ?? "pu";
}

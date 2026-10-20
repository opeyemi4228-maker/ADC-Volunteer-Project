import { all } from "@/lib/db";
import { areaTypeOf, areaName, childAreas, stateList } from "@/lib/geo";
import { ok, fail } from "@/lib/http";

/**
 * GET /api/v1/area-counts?code=           -> every state
 * GET /api/v1/area-counts?code=FCT        -> its LGAs
 * GET /api/v1/area-counts?code=FCT-002    -> its wards
 * GET /api/v1/area-counts?code=FCT-002-09 -> that ward only
 *
 * Verified groups and volunteers per area, for the public "who's near me"
 * finder. Counts only, never names or contacts, and small counts are masked.
 */
const COLS = {
  national: { group: "state_code", volunteer: "vote_state_code" },
  state: { group: "lga_code", volunteer: "vote_lga_code", where: ["state_code", "vote_state_code"] },
  lga: { group: "ward_code", volunteer: "vote_ward_code", where: ["lga_code", "vote_lga_code"] },
  ward: { group: "ward_code", volunteer: "vote_ward_code", where: ["ward_code", "vote_ward_code"] },
};

function counts(table, col, whereCol, code) {
  const where = whereCol ? `AND ${whereCol} = :code` : "";
  const rows = all(`SELECT ${col} AS k, COUNT(*) AS n FROM ${table} WHERE status = 'verified' ${where} GROUP BY ${col}`, whereCol ? { code } : {});
  return Object.fromEntries(rows.map((r) => [r.k, r.n]));
}

/**
 * Volunteer counts of 1–4 are reported as "fewer than 5" (volunteers: null,
 * fewVolunteers: true): in a small ward an exact small number can point to a
 * specific person, and political affiliation is sensitive data under the NDPA.
 * Groups are public entities, so their counts stay exact.
 */
const K = 5;
const masked = (n) => (n > 0 && n < K ? { volunteers: null, fewVolunteers: true } : { volunteers: n });

export async function GET(request) {
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim().toUpperCase();
  const type = areaTypeOf(code);
  if (!COLS[type]) return fail(400, "Choose a state, LGA or ward.");
  if (type !== "national" && areaName(code) === code) return fail(404, "Unknown area.");

  const c = COLS[type];
  const groups = counts("support_groups", c.group, c.where?.[0], code);
  const volunteers = counts("volunteers", c.volunteer, c.where?.[1], code);
  const children =
    type === "ward"
      ? [{ code, name: areaName(code) }]
      : type === "national"
        ? stateList.map((s) => ({ code: s.code, name: s.name }))
        : childAreas(type, code).map(({ code: k, name }) => ({ code: k, name }));

  const raw = children.map((a) => ({ ...a, groups: groups[a.code] ?? 0, volunteers: volunteers[a.code] ?? 0 }));
  const totals = raw.reduce((t, r) => ({ groups: t.groups + r.groups, volunteers: t.volunteers + r.volunteers }), { groups: 0, volunteers: 0 });
  return ok(
    {
      area: { code: code || "NG", type, name: type === "national" ? "Nigeria" : areaName(code) },
      totals: { groups: totals.groups, ...masked(totals.volunteers) },
      children: raw.map((r) => ({ ...r, ...masked(r.volunteers) })),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}

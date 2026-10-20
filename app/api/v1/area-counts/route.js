import { all } from "@/lib/db";
import { areaTypeOf, areaName, childAreas, stateList } from "@/lib/geo";
import { ok, fail } from "@/lib/http";

/**
 * GET /api/v1/area-counts?code=           -> every state
 * GET /api/v1/area-counts?code=FCT        -> its LGAs
 * GET /api/v1/area-counts?code=FCT-002    -> its wards
 * GET /api/v1/area-counts?code=FCT-002-09 -> that ward only
 *
 * Verified volunteers, and the polling units they cover, per area, for the
 * public "who's near me" finder. Counts only, never names or contacts, and
 * small volunteer counts are masked.
 */
const COLS = {
  national: { volunteer: "vote_state_code" },
  state: { volunteer: "vote_lga_code", where: [null, "vote_state_code"] },
  lga: { volunteer: "vote_ward_code", where: [null, "vote_lga_code"] },
  ward: { volunteer: "vote_ward_code", where: [null, "vote_ward_code"] },
};

function counts(col, whereCol, code, what = "COUNT(*)") {
  const where = whereCol ? `AND ${whereCol} = :code` : "";
  const rows = all(`SELECT ${col} AS k, ${what} AS n FROM volunteers WHERE status = 'verified' ${where} GROUP BY ${col}`, whereCol ? { code } : {});
  return Object.fromEntries(rows.map((r) => [r.k, r.n]));
}

/**
 * Volunteer counts of 1–4 are reported as "fewer than 5" (volunteers: null,
 * fewVolunteers: true): in a small ward an exact small number can point to a
 * specific person, and political affiliation is sensitive data under the NDPA.
 * Polling-unit counts don't point to anyone, so they stay exact.
 */
const K = 5;
const masked = (n) => (n > 0 && n < K ? { volunteers: null, fewVolunteers: true } : { volunteers: n });

export async function GET(request) {
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim().toUpperCase();
  const type = areaTypeOf(code);
  if (!COLS[type]) return fail(400, "Choose a state, LGA or ward.");
  if (type !== "national" && areaName(code) === code) return fail(404, "Unknown area.");

  const c = COLS[type];
  const volunteers = counts(c.volunteer, c.where?.[1], code);
  const pus = counts(c.volunteer, c.where?.[1], code, "COUNT(DISTINCT vote_pu_code)");
  const children =
    type === "ward"
      ? [{ code, name: areaName(code) }]
      : type === "national"
        ? stateList.map((s) => ({ code: s.code, name: s.name }))
        : childAreas(type, code).map(({ code: k, name }) => ({ code: k, name }));

  const raw = children.map((a) => ({ ...a, pollingUnits: pus[a.code] ?? 0, volunteers: volunteers[a.code] ?? 0 }));
  const totals = raw.reduce((t, r) => ({ pollingUnits: t.pollingUnits + r.pollingUnits, volunteers: t.volunteers + r.volunteers }), { pollingUnits: 0, volunteers: 0 });
  return ok(
    {
      area: { code: code || "NG", type, name: type === "national" ? "Nigeria" : areaName(code) },
      totals: { pollingUnits: totals.pollingUnits, ...masked(totals.volunteers) },
      children: raw.map((r) => ({ ...r, ...masked(r.volunteers) })),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}

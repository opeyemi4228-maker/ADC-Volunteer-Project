import { all, scalar } from "@/lib/db";
import { ok, fail, requirePower } from "@/lib/http";
import { areaSql } from "@/lib/scope";
import { areaTypeOf, placeLabel } from "@/lib/geo";
import { ROLE_LABELS } from "@/lib/options";

/**
 * GET /api/v1/positions/candidates?area=CODE&q=&page=
 * Volunteers who could take a position over an area: everyone registered
 * there (zone, state, LGA or ward; nationwide without an area), verified
 * first, with any positions they already hold. Rejected records are left out.
 */
export async function GET(request) {
  const { denied } = await requirePower("manage_users");
  if (denied) return denied;
  const url = new URL(request.url);
  const area = url.searchParams.get("area") || "NG";
  const q = String(url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const type = areaTypeOf(area);
  if (type === "pu") return fail(422, "Choose a zone, state, LGA or ward.");

  const where = areaSql("volunteer", type, area, "v");
  const params = { ...where.params, q, ql: `%${q}%` };
  const filter = `v.status != 'rejected' AND v.deletion_requested_at IS NULL AND ${where.sql}
    AND (:q::text = '' OR v.first_name || ' ' || v.surname ILIKE :ql OR v.surname || ' ' || v.first_name ILIKE :ql OR v.public_id ILIKE :ql)`;
  const PER = 25;
  const [total, rows] = await Promise.all([
    scalar(`SELECT COUNT(*) FROM volunteers v WHERE ${filter}`, params),
    all(
      `SELECT v.id, v.first_name, v.surname, v.public_id, v.status, v.vote_state_code, v.vote_lga_code, v.vote_ward_code,
         COALESCE((SELECT json_agg(r.role) FROM users u JOIN role_assignments r ON r.user_id = u.id
                   WHERE u.volunteer_id = v.id AND u.active = 1 AND r.role != 'volunteer'), '[]') AS positions,
         COALESCE((SELECT json_agg(vr.role) FROM volunteer_roles vr WHERE vr.volunteer_id = v.id), '[]') AS offers
       FROM volunteers v WHERE ${filter}
       ORDER BY (v.status = 'verified') DESC, v.first_name, v.surname
       LIMIT ${PER} OFFSET ${(page - 1) * PER}`,
      params,
    ),
  ]);
  const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x ?? []);
  return ok({
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PER)),
    items: rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.surname}`,
      publicId: r.public_id,
      status: r.status,
      place: placeLabel({ state_code: r.vote_state_code, lga_code: r.vote_lga_code, ward_code: r.vote_ward_code }),
      positions: parse(r.positions).map((p) => ROLE_LABELS[p] ?? p),
      offers: parse(r.offers),
    })),
  });
}

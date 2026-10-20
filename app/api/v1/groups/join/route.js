import { groupByCode } from "@/lib/registration";
import { placeLabel } from "@/lib/geo";
import { ok, fail } from "@/lib/http";

/** GET /api/v1/groups/join?code=KBW412 -> the group an invite code points to. */
export async function GET(request) {
  const code = new URL(request.url).searchParams.get("code");
  const g = groupByCode(code);
  if (!g) return fail(404, "We couldn't find a group with that code.");
  return ok({ group: { name: g.name, publicId: g.public_id, code: g.join_code, place: placeLabel(g), status: g.status, state: g.state_code, lga: g.lga_code, ward: g.ward_code } });
}

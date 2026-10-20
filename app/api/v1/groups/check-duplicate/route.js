import { similarGroups } from "@/lib/registration";
import { areaName } from "@/lib/geo";
import { ok } from "@/lib/http";

/** GET /api/v1/groups/check-duplicate?name=&state=&lga= ("Is your group one of these?") */
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const name = (q.get("name") ?? "").slice(0, 100);
  const state = q.get("state") ?? "";
  const lga = q.get("lga") ?? "";
  if (name.trim().length < 3 || !state) return ok({ matches: [] });
  const matches = similarGroups(name, state, lga || null).map((m) => ({
    name: m.name,
    publicId: m.public_id,
    lga: areaName(m.lga_code),
    sameLga: m.sameLga,
    status: m.status,
  }));
  return ok({ matches });
}

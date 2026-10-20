import { stateList, stateTree, lgaOf, wardUnits } from "@/lib/geo";
import { ok, fail } from "@/lib/http";

/**
 * GET /api/v1/geo/states
 * GET /api/v1/geo/states/{code}/lgas
 * GET /api/v1/geo/lgas/{code}/wards
 * GET /api/v1/geo/wards/{code}/polling-units?q=
 *
 * The website's own forms read the same data as static files from /geo (so
 * they cache on the phone); these endpoints serve USSD, WhatsApp and partners.
 */
export async function GET(request, { params }) {
  const parts = (await params).path;
  const cache = { headers: { "Cache-Control": "public, max-age=86400" } };
  if (parts.length === 1 && parts[0] === "states") return ok({ states: stateList }, cache);
  if (parts.length === 3 && parts[0] === "states" && parts[2] === "lgas") {
    const t = stateTree(parts[1]);
    return t ? ok({ lgas: t.lgas.map(({ code, name }) => ({ code, name })) }, cache) : fail(404, "Unknown state.");
  }
  if (parts.length === 3 && parts[0] === "lgas" && parts[2] === "wards") {
    const l = lgaOf(parts[1]);
    return l ? ok({ wards: l.wards.map(({ code, name, units }) => ({ code, name, units })) }, cache) : fail(404, "Unknown LGA.");
  }
  if (parts.length === 3 && parts[0] === "wards" && parts[2] === "polling-units") {
    const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase();
    const units = wardUnits(parts[1]).filter((u) => !q || u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q));
    return ok({ pollingUnits: units }, cache);
  }
  return fail(404, "Not found.");
}

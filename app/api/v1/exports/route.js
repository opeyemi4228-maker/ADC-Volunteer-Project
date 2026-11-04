import { run } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { coversArea } from "@/lib/scope";
import { onlyFilters, pickColumns } from "@/lib/volunteer-columns";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/exports { kind: volunteers|groups, area, reason, filters?, columns?, format? }
 * A request, never a download. `filters` is the volunteer directory's view
 * (its query string); without it the export is everyone in `area`.
 */
export async function POST(request) {
  const { viewer, denied } = await requirePower("request_export");
  if (denied) return denied;
  const { kind, area: chosen, reason, filters, columns, format } = await body(request);
  if (!["volunteers", "groups"].includes(kind)) return fail(422, "Choose what to export.");
  const view = kind === "volunteers" && filters && typeof filters === "object" ? onlyFilters(filters) : null;
  const area = view ? view.area ?? "" : chosen;
  // A directory view may cover the requester's whole area (no area filter); the download is still limited by their scope.
  if ((!view && !area) || (area && !coversArea(viewer, area))) return fail(422, "Choose an area you coordinate.");
  if (String(reason ?? "").trim().length < 10) return fail(422, "Say why you need this export (at least a sentence).");
  const id = uuid();
  await run("INSERT INTO exports (id, kind, filters, reason, requested_by, requester_name) VALUES (:id, :k, :f, :r, :u, :n)", {
    id, k: kind, f: JSON.stringify({ ...view, area, columns: view ? pickColumns(columns).map((c) => c.key).join(",") : undefined, format: format === "xlsx" ? "xlsx" : "csv" }), r: String(reason).trim().slice(0, 500), u: viewer.id, n: viewer.name,
  });
  await audit(viewer, "export_requested", "export", id, { kind, area, filters: view ?? undefined }, await clientIp());
  return ok({ id });
}

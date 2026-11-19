
import { one } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { scopeSql } from "@/lib/scope";
import { objectResponse } from "@/lib/objects";
import { fail } from "@/lib/http";

/**
 * GET /api/v1/volunteers/{id}/photo?size=thumb|medium
 * A volunteer's profile photo, for the volunteer themself and for accounts
 * whose area covers their record (the Super Admin sees every one).
 */
export async function GET(request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(404, "Not found.");
  const { id } = await params;
  const own = viewer.roles.find((r) => r.role === "volunteer")?.area_code;
  let v;
  if (own && own === id) v = await one("SELECT photo_key, photo_thumb_key FROM volunteers WHERE id = :id", { id });
  else {
    const s = scopeSql(viewer, "volunteer", "v");
    v = await one(`SELECT v.photo_key, v.photo_thumb_key FROM volunteers v WHERE v.id = :vid AND ${s.sql}`, { vid: id, ...s.params });
  }
  const size = new URL(request.url).searchParams.get("size");
  const key = size === "medium" ? v?.photo_key : v?.photo_thumb_key;
  return objectResponse(key, request, { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" });
}

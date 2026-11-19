
import { one } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { scopeSql } from "@/lib/scope";
import { objectResponse } from "@/lib/objects";
import { fail } from "@/lib/http";

/**
 * GET /api/v1/media/{id}/file?size=thumb|medium|full
 * Approved media are public (group galleries). Anything else is served only
 * to the Super Admin, and to the volunteer who sent it.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const size = new URL(request.url).searchParams.get("size") ?? "medium";
  const m = await one("SELECT * FROM media_items WHERE id = :id", { id });
  if (!m || m.kind === "link") return fail(404, "Not found.");
  const isPublic = ["approved", "publicity"].includes(m.moderation_status);
  if (!isPublic) {
    const viewer = await getViewer();
    if (!viewer) return fail(404, "Not found.");
    // The Super Admin sees everything; a volunteer sees their own uploads while they wait for review.
    const own = viewer.roles.find((r) => r.role === "volunteer")?.area_code;
    const s = scopeSql(viewer, "media");
    if (!(own && m.volunteer_id === own) && !await one(`SELECT 1 AS x FROM media_items WHERE id = :mid AND ${s.sql}`, { mid: id, ...s.params })) return fail(404, "Not found.");
  }
  const key = m.kind === "photo" ? ({ thumb: m.thumbnail_key, medium: m.medium_key, full: m.storage_key }[size] ?? m.medium_key) : m.storage_key;
  return objectResponse(key, request, {
    "Content-Type": m.kind === "photo" ? "image/jpeg" : m.mime ?? "video/mp4",
    "Cache-Control": isPublic ? "public, max-age=86400" : "private, no-store",
  });
}

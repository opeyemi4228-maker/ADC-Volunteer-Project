import fs from "node:fs";

import { one } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { scopeSql } from "@/lib/scope";
import { objectPath } from "@/lib/storage";
import { fail } from "@/lib/http";

/**
 * GET /api/v1/media/{id}/file?size=thumb|medium|full
 * Approved media are public (group galleries). Anything else is served only
 * to coordinators whose area contains it.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const size = new URL(request.url).searchParams.get("size") ?? "medium";
  const m = one("SELECT * FROM media_items WHERE id = :id", { id });
  if (!m || m.kind === "link") return fail(404, "Not found.");
  const isPublic = ["approved", "publicity"].includes(m.moderation_status);
  if (!isPublic) {
    const viewer = await getViewer();
    if (!viewer) return fail(404, "Not found.");
    const s = scopeSql(viewer, "media");
    if (!one(`SELECT 1 AS x FROM media_items WHERE id = :mid AND ${s.sql}`, { mid: id, ...s.params })) return fail(404, "Not found.");
  }
  const key = m.kind === "photo" ? ({ thumb: m.thumbnail_key, medium: m.medium_key, full: m.storage_key }[size] ?? m.medium_key) : m.storage_key;
  const file = key && objectPath(key);
  if (!file || !fs.existsSync(file)) return fail(404, "Not found.");
  const stat = fs.statSync(file);
  const type = m.kind === "photo" ? "image/jpeg" : m.mime ?? "video/mp4";

  // Byte ranges, so videos can seek and resume on a weak connection.
  const range = request.headers.get("range");
  const cache = isPublic ? "public, max-age=86400" : "private, max-age=3600";
  if (range && m.kind === "video") {
    const [s, e] = range.replace("bytes=", "").split("-");
    const start = Number(s);
    const end = e ? Number(e) : Math.min(stat.size - 1, start + 1024 * 1024 - 1);
    return new Response(fs.createReadStream(file, { start, end }), {
      status: 206,
      headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), "Cache-Control": cache },
    });
  }
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": type, "Content-Length": String(stat.size), "Cache-Control": cache, "Accept-Ranges": "bytes" } });
}

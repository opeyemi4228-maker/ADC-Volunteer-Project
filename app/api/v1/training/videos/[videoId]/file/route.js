import fs from "node:fs";

import { getViewer } from "@/lib/auth";
import { videoFor } from "@/lib/training";
import { objectPath } from "@/lib/storage";
import { fail } from "@/lib/http";

/**
 * GET /api/v1/training/videos/{videoId}/file
 * Streams an uploaded training video to a signed-in account that may watch it
 * (its audience, in one of their languages). Byte ranges let it seek and
 * resume on a weak connection.
 */
export async function GET(request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const v = await videoFor(viewer, (await params).videoId);
  if (!v || v.kind !== "video" || !v.storage_key) return fail(404, "Not found.");
  const file = objectPath(v.storage_key);
  if (!fs.existsSync(file)) return fail(404, "Not found.");
  const { size } = fs.statSync(file);
  const type = v.mime ?? "video/mp4";
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };

  const range = request.headers.get("range");
  if (range) {
    const [s, e] = range.replace("bytes=", "").split("-");
    const start = Number(s) || 0;
    const end = Math.min(size - 1, e ? Number(e) : start + 2 * 1024 * 1024 - 1);
    if (start >= size || end < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(fs.createReadStream(file, { start, end }), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(fs.createReadStream(file), { headers: { ...headers, "Content-Length": String(size) } });
}

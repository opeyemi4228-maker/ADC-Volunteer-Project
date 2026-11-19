
import { getViewer } from "@/lib/auth";
import { videoFor, recordDownload } from "@/lib/training";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { objectResponse } from "@/lib/objects";
import { fail } from "@/lib/http";

/**
 * GET /api/v1/training/videos/{videoId}/file
 * Streams an uploaded training video to a signed-in account that may watch it
 * (its audience, in one of their languages). Byte ranges let it seek and
 * resume on a weak connection. With ?download=1 the file is saved instead of
 * played, and the download is recorded for the Super Admin.
 */
export async function GET(request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const v = await videoFor(viewer, (await params).videoId);
  if (!v || v.kind !== "video" || !v.storage_key) return fail(404, "Not found.");
  const type = v.mime ?? "video/mp4";
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  const download = new URL(request.url).searchParams.get("download") === "1";
  if (download) {
    const ext = { "video/mp4": "mp4", "video/quicktime": "mov", "video/3gpp": "3gp" }[type] ?? "mp4";
    const base = `${v.module_title ?? "training"}-${v.language}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "training";
    headers["Content-Disposition"] = `attachment; filename="${base}.${ext}"`;
    headers["Cache-Control"] = "private, no-store";
  }

  const range = request.headers.get("range");
  // A download is counted once, when it starts (a resumed download asks for a later byte range).
  if (download && (!range || /^bytes=0-/.test(range))) {
    await recordDownload(viewer, v);
    await audit(viewer, "training_downloaded", "training", v.module_id, { language: v.language }, await clientIp());
  }
  return objectResponse(v.storage_key, request, headers);
}

import { getViewer } from "@/lib/auth";
import { updateView } from "@/lib/training";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/training/views/{viewId} { seconds, position, duration, ended }
 * Progress for one viewing: sent every few seconds while playing, on pause and
 * at the end, and (with navigator.sendBeacon) when the page is closed.
 */
export async function POST(request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const out = await updateView(viewer, (await params).viewId, await body(request));
  if (!out) return fail(404, "Not found.");
  return ok(out);
}

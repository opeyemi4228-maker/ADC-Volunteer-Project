import { getViewer } from "@/lib/auth";
import { videoFor, startView } from "@/lib/training";
import { ok, fail } from "@/lib/http";

/**
 * POST /api/v1/training/videos/{videoId}/views
 * The player calls this when someone presses play (or opens a linked video).
 * Starts one viewing and returns its id for progress updates.
 */
export async function POST(_request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const v = await videoFor(viewer, (await params).videoId);
  if (!v) return fail(404, "Not found.");
  return ok({ id: await startView(viewer, v) });
}

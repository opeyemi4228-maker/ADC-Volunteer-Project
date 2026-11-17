import { one } from "@/lib/db";
import { getViewer, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { audiencesFor, submitFeedback } from "@/lib/training";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/training/{id}/feedback { language, answers: { [questionId]: optionIndex | text } }
 * Saves the viewer's feedback for a lesson. One answer per person per lesson,
 * whichever language they answer in.
 */
export async function POST(request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to continue.");
  const { id } = await params;
  const m = await one("SELECT audience FROM training_modules WHERE id = :id", { id });
  if (!m || !audiencesFor(viewer).includes(m.audience)) return fail(404, "Training not found.");
  const d = await body(request);
  const out = await submitFeedback(viewer, id, String(d.language ?? ""), d.answers);
  if (out.error) return fail(out.answered ? 409 : 422, out.error, { errors: out.errors, answered: out.answered });
  await audit(viewer, "training_feedback", "training", id, { language: d.language }, await clientIp());
  return ok({ done: true });
}

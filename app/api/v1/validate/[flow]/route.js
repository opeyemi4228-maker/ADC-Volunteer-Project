import { validateVolunteerStep } from "@/lib/registration";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/validate/volunteer { step, data } -> { errors }
 * Checks one screen with the same rules the final submit uses, so people hear
 * about a problem on the screen where they can fix it.
 */
export async function POST(request, { params }) {
  const { flow } = await params;
  if (flow !== "volunteer") return fail(404, "Unknown form.");
  const { step, data } = await body(request);
  return ok({ errors: validateVolunteerStep(Number(step), data ?? {}) });
}

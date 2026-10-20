import { validateGroupStep, validateVolunteerStep } from "@/lib/registration";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/validate/{group|volunteer} { step, data } -> { errors }
 * Checks one step of a form with the same rules the final submit uses, so
 * people hear about a problem on the step where they can fix it.
 */
export async function POST(request, { params }) {
  const { flow } = await params;
  const { step, data } = await body(request);
  const n = Number(step);
  if (flow === "group") return ok({ errors: validateGroupStep(n, data ?? {}) });
  if (flow === "volunteer") return ok({ errors: validateVolunteerStep(n, data ?? {}) });
  return fail(404, "Unknown form.");
}

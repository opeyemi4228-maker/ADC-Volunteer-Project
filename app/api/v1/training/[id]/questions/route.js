import { one } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { questionErrors, saveQuestions } from "@/lib/training";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * PUT /api/v1/training/{id}/questions { questions: [{ id?, kind, prompt, options?, required }] }
 * The Super Admin sets a lesson's feedback questions, each written in one or
 * more languages. The whole list is replaced; questions keep their answers
 * as long as they keep their id.
 */
export async function PUT(request, { params }) {
  const { viewer, denied } = await requirePower("manage_training");
  if (denied) return denied;
  const { id } = await params;
  if (!await one("SELECT 1 FROM training_modules WHERE id = :id", { id })) return fail(404, "Training not found.");
  const { errors, questions } = questionErrors((await body(request)).questions);
  if (Object.keys(errors).length) return fail(422, Object.values(errors)[0], { errors });
  await saveQuestions(id, questions);
  await audit(viewer, "training_questions_saved", "training", id, { count: questions.length }, await clientIp());
  return ok({ count: questions.length });
}

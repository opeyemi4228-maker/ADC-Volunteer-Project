import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setViewerLanguages } from "@/lib/training";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * PUT /api/v1/training/languages { languages: [...] }
 * Sets the languages the signed-in account watches training in. For a
 * volunteer these are the languages on their record.
 */
export async function PUT(request) {
  const { viewer, denied } = await requirePower(null);
  if (denied) return denied;
  const out = await setViewerLanguages(viewer, (await body(request)).languages);
  if (out.error) return fail(422, out.error);
  await audit(viewer, "languages_changed", "user", viewer.id, { languages: out.languages }, await clientIp());
  return ok(out);
}

import { one, run, nowIso } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { trainingFor, moduleErrors } from "@/lib/training";
import { ok, fail, body, requirePower } from "@/lib/http";

/** GET /api/v1/training: the modules and videos the signed-in account may watch, in their languages. */
export async function GET() {
  const { viewer, denied } = await requirePower(null);
  if (denied) return denied;
  return ok(await trainingFor(viewer));
}

/** POST /api/v1/training { title, description, audience }: the Super Admin adds a module. Videos are added per language. */
export async function POST(request) {
  const { viewer, denied } = await requirePower("manage_training");
  if (denied) return denied;
  const d = await body(request);
  const e = moduleErrors(d);
  if (Object.keys(e).length) return fail(422, "Some answers need attention.", { errors: e });
  const id = uuid();
  const last = await one("SELECT COALESCE(MAX(sort), 0) AS n FROM training_modules");
  await run(
    `INSERT INTO training_modules (id, title, description, audience, sort, created_by, creator_name, created_at, updated_at)
     VALUES (:id, :t, :d, :a, :s, :by, :name, :now, :now)`,
    {
      id, t: String(d.title).trim(), d: String(d.description ?? "").trim() || null, a: d.audience || "all",
      s: Number(last?.n ?? 0) + 1, by: viewer.id, name: viewer.name, now: nowIso(),
    },
  );
  await audit(viewer, "training_created", "training", id, { title: String(d.title).trim() }, await clientIp());
  return ok({ id });
}

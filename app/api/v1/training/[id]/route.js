import fs from "node:fs";

import { all, one, run, nowIso } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { objectPath } from "@/lib/storage";
import { ok, fail, body, requirePower } from "@/lib/http";
import { moduleErrors } from "@/lib/training";

/** PATCH /api/v1/training/{id} { title, description, audience }: the Super Admin edits a module. */
export async function PATCH(request, { params }) {
  const { viewer, denied } = await requirePower("manage_training");
  if (denied) return denied;
  const { id } = await params;
  const m = await one("SELECT * FROM training_modules WHERE id = :id", { id });
  if (!m) return fail(404, "Training not found.");
  const d = { title: m.title, description: m.description, audience: m.audience, ...(await body(request)) };
  const e = moduleErrors(d);
  if (Object.keys(e).length) return fail(422, "Some answers need attention.", { errors: e });
  await run("UPDATE training_modules SET title = :t, description = :d, audience = :a, updated_at = :now WHERE id = :id", {
    id, t: String(d.title).trim(), d: String(d.description ?? "").trim() || null, a: d.audience, now: nowIso(),
  });
  await audit(viewer, "training_updated", "training", id, null, await clientIp());
  return ok({ id });
}

/** DELETE /api/v1/training/{id}: removes a module, its videos and their files. */
export async function DELETE(_request, { params }) {
  const { viewer, denied } = await requirePower("manage_training");
  if (denied) return denied;
  const { id } = await params;
  const m = await one("SELECT title FROM training_modules WHERE id = :id", { id });
  if (!m) return fail(404, "Training not found.");
  const files = await all("SELECT storage_key FROM training_videos WHERE module_id = :id AND storage_key IS NOT NULL", { id });
  await run("DELETE FROM training_modules WHERE id = :id", { id });
  for (const f of files) fs.rm(objectPath(f.storage_key), { force: true }, () => {});
  await audit(viewer, "training_deleted", "training", id, { title: m.title }, await clientIp());
  return ok({ deleted: true });
}

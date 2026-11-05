import fs from "node:fs";

import { one, run, nowIso } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { objectPath } from "@/lib/storage";
import { ok, fail, body, requirePower } from "@/lib/http";

const ownVolunteer = (viewer) => viewer.roles.find((r) => r.role === "volunteer")?.area_code ?? null;

async function removeFiles(row) {
  for (const k of [row?.photo_key, row?.photo_thumb_key]) if (k) fs.rm(objectPath(k), { force: true }, () => {});
}

/**
 * POST /api/v1/me/photo { upload_id }: a volunteer sets their profile photo
 * from a finished photo upload of theirs. The upload was already re-encoded
 * without metadata (lib/storage.js), so no location leaves with it.
 */
export async function POST(request) {
  const { viewer, denied } = await requirePower("volunteer");
  if (denied) return denied;
  const volunteerId = ownVolunteer(viewer);
  if (!volunteerId) return fail(403, "Only volunteers can add a profile photo here.");
  const { upload_id: uploadId } = await body(request);
  const upload = await one("SELECT * FROM uploads WHERE id = :u AND owner_hash = :o AND done = 1", { u: String(uploadId ?? ""), o: `user:${viewer.id}` });
  if (!upload || upload.kind !== "photo") return fail(422, "The photo has not finished uploading. Try again.");

  const old = await one("SELECT photo_key, photo_thumb_key FROM volunteers WHERE id = :v", { v: volunteerId });
  await run("UPDATE volunteers SET photo_key = :mk, photo_thumb_key = :tk, photo_updated_at = :now, updated_at = :now WHERE id = :v", {
    v: volunteerId, mk: upload.medium_key, tk: upload.thumbnail_key, now: nowIso(),
  });
  // The upload is used up: it can not be attached again elsewhere. Its full-size copy is not needed.
  await run("UPDATE uploads SET owner_hash = :o WHERE id = :u", { o: `photo:${volunteerId}`, u: upload.id });
  if (upload.storage_key) fs.rm(objectPath(upload.storage_key), { force: true }, () => {});
  if (old?.photo_key !== upload.medium_key) await removeFiles(old);
  await audit(viewer, "photo_changed", "volunteer", volunteerId, null, await clientIp());
  return ok({ photo: `/api/v1/volunteers/${volunteerId}/photo?size=thumb` });
}

/** DELETE /api/v1/me/photo: the volunteer removes their photo. */
export async function DELETE() {
  const { viewer, denied } = await requirePower("volunteer");
  if (denied) return denied;
  const volunteerId = ownVolunteer(viewer);
  if (!volunteerId) return fail(403, "Only volunteers can remove a profile photo here.");
  const old = await one("SELECT photo_key, photo_thumb_key FROM volunteers WHERE id = :v", { v: volunteerId });
  await run("UPDATE volunteers SET photo_key = NULL, photo_thumb_key = NULL, photo_updated_at = :now, updated_at = :now WHERE id = :v", { v: volunteerId, now: nowIso() });
  await removeFiles(old);
  await audit(viewer, "photo_removed", "volunteer", volunteerId, null, await clientIp());
  return ok({ removed: true });
}

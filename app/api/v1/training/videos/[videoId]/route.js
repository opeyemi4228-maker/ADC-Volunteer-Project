import fs from "node:fs";

import { one, run } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { objectPath } from "@/lib/storage";
import { ok, fail, requirePower } from "@/lib/http";

/** DELETE /api/v1/training/videos/{videoId}: the Super Admin removes one language's video. */
export async function DELETE(_request, { params }) {
  const { viewer, denied } = await requirePower("manage_training");
  if (denied) return denied;
  const { videoId } = await params;
  const v = await one("SELECT * FROM training_videos WHERE id = :id", { id: videoId });
  if (!v) return fail(404, "Video not found.");
  await run("DELETE FROM training_videos WHERE id = :id", { id: videoId });
  if (v.storage_key) fs.rm(objectPath(v.storage_key), { force: true }, () => {});
  await audit(viewer, "training_video_removed", "training", v.module_id, { language: v.language }, await clientIp());
  return ok({ deleted: true });
}

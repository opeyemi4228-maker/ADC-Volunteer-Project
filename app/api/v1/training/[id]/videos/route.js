import fs from "node:fs";

import { one, run, tx, nowIso } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { objectPath } from "@/lib/storage";
import { cleanVideoUrl } from "@/lib/training";
import { TRAINING_LANGUAGES } from "@/lib/options";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/training/{id}/videos { language, upload_id | external_url }
 * The Super Admin adds a module's video in one language: a finished upload of
 * theirs, or a link. A video already there in that language is replaced.
 */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("manage_training");
  if (denied) return denied;
  const { id } = await params;
  const m = await one("SELECT id, title FROM training_modules WHERE id = :id", { id });
  if (!m) return fail(404, "Training not found.");
  const d = await body(request);
  if (!TRAINING_LANGUAGES.some((l) => l.value === d.language)) return fail(422, "Choose the language of this video.", { errors: { language: "Choose the language." } });

  let upload = null;
  let url = null;
  if (d.upload_id) {
    upload = await one("SELECT * FROM uploads WHERE id = :u AND owner_hash = :o AND done = 1", { u: String(d.upload_id), o: `user:${viewer.id}` });
    if (!upload || upload.kind !== "video") return fail(422, "The video has not finished uploading. Wait for it, or upload it again.");
  } else {
    url = cleanVideoUrl(d.external_url);
    if (!url) return fail(422, "Upload a video or paste a link to one.", { errors: { external_url: "Paste a full link, starting with https://" } });
  }

  const old = await one("SELECT storage_key FROM training_videos WHERE module_id = :m AND language = :l", { m: id, l: d.language });
  const videoId = uuid();
  await tx(async () => {
    await run("DELETE FROM training_videos WHERE module_id = :m AND language = :l", { m: id, l: d.language });
    await run(
      `INSERT INTO training_videos (id, module_id, language, kind, storage_key, mime, external_url, size, created_by, created_at)
       VALUES (:id, :m, :l, :k, :sk, :mime, :url, :size, :by, :now)`,
      {
        id: videoId, m: id, l: d.language, k: upload ? "video" : "link", sk: upload?.storage_key ?? null, mime: upload?.mime ?? null,
        url, size: upload?.size ?? null, by: viewer.id, now: nowIso(),
      },
    );
    await run("UPDATE training_modules SET updated_at = :now WHERE id = :m", { m: id, now: nowIso() });
    // The upload now belongs to the training video; it can not be attached anywhere else.
    if (upload) await run("UPDATE uploads SET owner_hash = :o WHERE id = :u", { o: `training:${videoId}`, u: upload.id });
  });
  if (old?.storage_key && old.storage_key !== upload?.storage_key) fs.rm(objectPath(old.storage_key), { force: true }, () => {});
  await audit(viewer, "training_video_added", "training", id, { language: d.language, kind: upload ? "video" : "link" }, await clientIp());
  return ok({ id: videoId });
}

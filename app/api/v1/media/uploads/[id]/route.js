import fs from "node:fs";

import { getUpload, appendChunk, objectPath } from "@/lib/storage";
import { run } from "@/lib/db";
import { uploadOwner } from "@/lib/owner";
import { ok, fail } from "@/lib/http";

/** GET: where to resume (and, once done, a preview of the thumbnail). */
export async function GET(request, { params }) {
  const owner = await uploadOwner();
  const upload = owner ? getUpload((await params).id, owner) : null;
  if (!upload) return fail(404, "Upload not found.");
  if (new URL(request.url).searchParams.get("preview") && upload.thumbnail_key) {
    const file = objectPath(upload.thumbnail_key);
    return new Response(fs.readFileSync(file), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  }
  return ok({ offset: upload.offset, size: upload.size, done: Boolean(upload.done), error: upload.error, kind: upload.kind });
}

/** PATCH with header Upload-Offset and the raw chunk as the body. */
export async function PATCH(request, { params }) {
  const owner = await uploadOwner();
  const upload = owner ? getUpload((await params).id, owner) : null;
  if (!upload) return fail(404, "Upload not found.");
  if (upload.error) return fail(422, upload.error);
  const offset = Number(request.headers.get("Upload-Offset"));
  const chunk = Buffer.from(await request.arrayBuffer());
  if (chunk.length > 1024 * 1024) return fail(413, "Chunk too large.");
  const result = await appendChunk(upload, offset, chunk);
  if (result.conflict) return fail(409, "Offset mismatch.", { offset: result.offset });
  if (result.error) return fail(422, result.error);
  return ok(result);
}

export async function DELETE(_request, { params }) {
  const owner = await uploadOwner();
  const upload = owner ? getUpload((await params).id, owner) : null;
  if (!upload) return fail(404, "Upload not found.");
  if (!upload.done) fs.rmSync(upload.temp_path, { force: true });
  run("DELETE FROM uploads WHERE id = :id AND done = 0", { id: upload.id });
  return ok({ deleted: true });
}

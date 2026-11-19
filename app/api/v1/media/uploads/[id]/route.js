
import { getUpload, appendChunk, discardUploadParts } from "@/lib/storage";
import { run, tx, one } from "@/lib/db";
import { uploadOwner } from "@/lib/owner";
import { objectResponse } from "@/lib/objects";
import { readLimitedBody } from "@/lib/request-body";
import { ok, fail } from "@/lib/http";

export const maxDuration = 300;

/** GET: where to resume (and, once done, a preview of the thumbnail). */
export async function GET(request, { params }) {
  const owner = await uploadOwner();
  const upload = owner ? await getUpload((await params).id, owner) : null;
  if (!upload) return fail(404, "Upload not found.");
  if (new URL(request.url).searchParams.get("preview") && upload.thumbnail_key) {
    return objectResponse(upload.thumbnail_key, request, { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" });
  }
  return ok({ offset: upload.offset, size: upload.size, done: Boolean(upload.done), error: upload.error, kind: upload.kind });
}

/** PATCH with header Upload-Offset and the raw chunk as the body. */
export async function PATCH(request, { params }) {
  const owner = await uploadOwner();
  const upload = owner ? await getUpload((await params).id, owner) : null;
  if (!upload) return fail(404, "Upload not found.");
  if (upload.error) return fail(422, upload.error);
  const rawOffset = request.headers.get("Upload-Offset");
  if (!rawOffset || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(Number(rawOffset))) return fail(400, "A valid Upload-Offset is required.");
  const offset = Number(rawOffset);
  let chunk;
  try { chunk = await readLimitedBody(request, 1024 * 1024); }
  catch (error) {
    if (error instanceof RangeError) return fail(413, "Chunk too large.");
    return fail(400, "The upload stream was interrupted. Retry this chunk.");
  }
  const result = await appendChunk(upload, offset, chunk);
  if (result.conflict) return fail(409, "Offset mismatch.", { offset: result.offset });
  if (result.error) return fail(422, result.error);
  return ok(result);
}

export async function DELETE(_request, { params }) {
  const owner = await uploadOwner();
  const upload = owner ? await getUpload((await params).id, owner) : null;
  if (!upload) return fail(404, "Upload not found.");
  await tx(async () => {
    const current = await one("SELECT * FROM uploads WHERE id = :id AND owner_hash = :o FOR UPDATE", { id: upload.id, o: owner });
    if (current && !current.done) {
      await discardUploadParts(current);
      await run("DELETE FROM uploads WHERE id = :id", { id: current.id });
    }
  });
  return ok({ deleted: true });
}

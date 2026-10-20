import { uploadOwner } from "@/lib/owner";
import { createUpload } from "@/lib/storage";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/media/uploads { name, type, size } -> { id, offset, chunkSize }
 * Then PATCH /api/v1/media/uploads/{id} with the bytes from `offset`.
 */
export async function POST(request) {
  const owner = await uploadOwner({ create: true });
  if (!owner) return fail(401, "Verify your phone number first.");
  const { name, type, size } = await body(request);
  const result = createUpload({ ownerHash: owner, fileName: name, type, size: Number(size) });
  if (result.error) return fail(400, result.error);
  return ok(result);
}

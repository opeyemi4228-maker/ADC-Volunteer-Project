import { getViewer } from "@/lib/auth";
import { uploadOwner } from "@/lib/owner";
import { createUpload } from "@/lib/storage";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/media/uploads { name, type, size } -> { id, offset, chunkSize }
 * Then PATCH /api/v1/media/uploads/{id} with the bytes from `offset`.
 * `purpose: "training"` (Super Admin only) allows the larger training-video limit.
 */
export async function POST(request) {
  const owner = await uploadOwner({ create: true });
  if (!owner) return fail(401, "Verify your phone number first.");
  const { name, type, size, purpose } = await body(request);
  if (purpose === "training" && !(await getViewer())?.powers.includes("manage_training")) return fail(403, "Only the Super Admin can upload training videos.");
  const result = await createUpload({ ownerHash: owner, fileName: name, type, size: Number(size), purpose: purpose === "training" ? "training" : null });
  if (result.error) return fail(400, result.error);
  return ok(result);
}

import { one, run } from "@/lib/db";
import { uuid } from "@/lib/crypto";
import { getRegistrant } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, body } from "@/lib/http";

/**
 * POST /api/v1/me/data/delete-request { details } -> { ok, reference }
 * Queues a deletion request for the data protection officer. Nothing is
 * deleted automatically: a person may also coordinate a group others rely on,
 * so the DPO confirms and carries it out (Workspace -> Data requests).
 */
export async function POST(request) {
  const reg = await getRegistrant();
  if (!reg) return fail(401, "Verify your phone number first.");
  const open = await one("SELECT id FROM data_requests WHERE subject_hash = :h AND kind = 'deletion' AND status = 'open'", { h: reg.phoneHash });
  if (open) return fail(409, "You already have a deletion request open. We will contact you about it.");
  const { details } = await body(request);
  const id = uuid();
  const reference = `DR-${id.slice(0, 8).toUpperCase()}`;
  await run("INSERT INTO data_requests (id, subject_hash, kind, details) VALUES (:id, :h, 'deletion', :d)", {
    id, h: reg.phoneHash, d: JSON.stringify({ reference, details: String(details ?? "").slice(0, 1000) }),
  });
  await run("UPDATE volunteers SET deletion_requested_at = now() WHERE phone_hash = :h", { h: reg.phoneHash });
  audit({ name: "Registrant" }, "deletion_requested", "data_request", id, { reference });
  return ok({ ok: true, reference });
}

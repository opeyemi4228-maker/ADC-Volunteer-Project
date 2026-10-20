import { one, run, nowIso } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { eraseSubject } from "@/lib/erase";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/** POST { action: "erase" | "decline", note } (data protection officer) */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("data_requests");
  if (denied) return denied;
  const { id } = await params;
  const r = one("SELECT * FROM data_requests WHERE id = :id AND status = 'open'", { id });
  if (!r) return fail(404, "This request is not open.");
  const d = await body(request);
  let result = null;
  if (d.action === "erase") result = eraseSubject(r.subject_hash);
  else if (d.action !== "decline") return fail(400, "Unknown action.");
  run("UPDATE data_requests SET status = :s, handled_by = :u, handled_at = :now WHERE id = :id", { s: d.action === "erase" ? "completed" : "declined", u: viewer.id, now: nowIso(), id });
  audit(viewer, `data_request_${d.action === "erase" ? "completed" : "declined"}`, "data_request", id, { ...result, note: d.note }, await clientIp());
  return ok({ ok: true, ...result });
}

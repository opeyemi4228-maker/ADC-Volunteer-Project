import { one } from "@/lib/db";
import { getViewer, clientIp } from "@/lib/auth";
import { scopeSql } from "@/lib/scope";
import { buildCertificate } from "@/lib/certificate";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/http";

/** GET /api/v1/volunteers/{id}/certificate: the PDF, for the volunteer themself or coordinators over them. */
export async function GET(_request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to download the certificate.");
  const { id } = await params;
  const own = viewer.roles.some((r) => r.role === "volunteer" && r.area_code === id);
  const s = scopeSql(viewer, "volunteer", "v");
  const v = one(`SELECT v.id, v.status FROM volunteers v WHERE v.id = :vid AND (${own ? "1" : s.sql})`, { vid: id, ...s.params });
  if (!v) return fail(404, "Volunteer not found.");
  if (v.status !== "verified") return fail(409, "The certificate is available once you have been verified.");
  const cert = await buildCertificate(v.id);
  audit(viewer, "certificate_downloaded", "volunteer", v.id, { number: cert.number }, await clientIp());
  return new Response(cert.bytes, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${cert.filename}"`, "Cache-Control": "private, no-store" },
  });
}

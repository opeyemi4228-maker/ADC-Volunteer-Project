import { one } from "@/lib/db";
import { getViewer, clientIp } from "@/lib/auth";
import { scopeSql } from "@/lib/scope";
import { buildCertificate } from "@/lib/certificate";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/http";

/** GET /api/v1/groups/{id}/certificate: the PDF, for the group itself or coordinators over it. */
export async function GET(_request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to download the certificate.");
  const { id } = await params;
  const s = scopeSql(viewer, "group", "g");
  const g = one(`SELECT g.id, g.status FROM support_groups g WHERE (g.id = :gid OR g.public_id = :gid) AND ${s.sql}`, { gid: id, ...s.params });
  if (!g) return fail(404, "Group not found.");
  if (g.status !== "verified") return fail(409, "The certificate is available once the group has been approved.");
  const cert = await buildCertificate(g.id);
  audit(viewer, "certificate_downloaded", "group", g.id, { number: cert.number }, await clientIp());
  return new Response(cert.bytes, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${cert.filename}"`, "Cache-Control": "private, no-store" },
  });
}

import fs from "node:fs";

import { one } from "@/lib/db";
import { getViewer, clientIp } from "@/lib/auth";
import { scopeSql } from "@/lib/scope";
import { objectPath } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/http";

/** GET /api/v1/groups/{id}/members-file: the membership list exactly as uploaded (coordinators and the group). */
export async function GET(_request, { params }) {
  const viewer = await getViewer();
  if (!viewer || viewer.powers.includes("summary_only")) return fail(404, "Not found.");
  const { id } = await params;
  const s = scopeSql(viewer, "group", "g");
  const g = one(`SELECT g.id, g.public_id, g.membership_upload_id FROM support_groups g WHERE g.id = :gid AND ${s.sql}`, { gid: id, ...s.params });
  const u = g?.membership_upload_id ? one("SELECT storage_key, mime FROM uploads WHERE id = :id", { id: g.membership_upload_id }) : null;
  if (!u || !fs.existsSync(objectPath(u.storage_key))) return fail(404, "No membership list uploaded.");
  audit(viewer, "membership_list_downloaded", "group", g.id, null, await clientIp());
  const ext = u.storage_key.split(".").pop();
  return new Response(fs.readFileSync(objectPath(u.storage_key)), {
    headers: { "Content-Type": u.mime, "Content-Disposition": `attachment; filename="members-${g.public_id}.${ext}"`, "Cache-Control": "private, no-store" },
  });
}

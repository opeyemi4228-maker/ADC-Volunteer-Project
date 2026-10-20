import fs from "node:fs";

import { one } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { scopeSql } from "@/lib/scope";
import { objectPath } from "@/lib/storage";

/** GET /api/v1/groups/{id}/logo: public once the group is verified, otherwise for people who can see the group. */
export async function GET(_request, { params }) {
  const { id } = await params;
  const g = one("SELECT id, status, logo_key FROM support_groups WHERE id = :id OR public_id = :id", { id });
  if (!g?.logo_key) return new Response("Not found", { status: 404 });
  if (g.status !== "verified") {
    const viewer = await getViewer();
    const s = viewer ? scopeSql(viewer, "group", "g") : null;
    if (!s || !one(`SELECT 1 AS x FROM support_groups g WHERE g.id = :gid AND ${s.sql}`, { gid: g.id, ...s.params })) return new Response("Not found", { status: 404 });
  }
  const file = objectPath(g.logo_key);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": "image/jpeg", "Cache-Control": g.status === "verified" ? "public, max-age=86400" : "private, max-age=600" } });
}

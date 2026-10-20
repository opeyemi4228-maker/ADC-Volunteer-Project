import { one, run, nowIso } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { uploadOwner } from "@/lib/owner";
import { scopeSql } from "@/lib/scope";
import { importMembership } from "@/lib/members";
import { audit } from "@/lib/audit";
import { ok, fail, body, requirePower } from "@/lib/http";

/**
 * POST /api/v1/groups/{id}/profile { logo_upload_id?, membership_upload_id? }
 * Lets a group update its logo or membership list from the dashboard.
 */
export async function POST(request, { params }) {
  const { viewer, denied } = await requirePower("workspace");
  if (denied) return denied;
  const { id } = await params;
  const s = scopeSql(viewer, "group", "g");
  const g = one(`SELECT g.id FROM support_groups g WHERE g.id = :gid AND ${s.sql}`, { gid: id, ...s.params });
  if (!g) return fail(404, "Group not found.");
  const d = await body(request);
  const owner = await uploadOwner();
  const out = {};
  if (d.logo_upload_id) {
    const u = one("SELECT medium_key FROM uploads WHERE id = :id AND owner_hash = :o AND done = 1 AND kind = 'photo'", { id: d.logo_upload_id, o: owner });
    if (!u) return fail(422, "The logo didn't finish uploading. Try again.");
    run("UPDATE support_groups SET logo_key = :k, updated_at = :now WHERE id = :id", { k: u.medium_key, now: nowIso(), id: g.id });
    out.logo = true;
  }
  if (d.membership_upload_id) {
    try {
      const m = importMembership(g.id, d.membership_upload_id, owner);
      if (m.error) return fail(422, m.error);
      out.membership = m;
    } catch (e) {
      return fail(422, e.user ? e.message : "The membership list couldn't be read.");
    }
  }
  audit(viewer, "group_profile_updated", "group", g.id, out, await clientIp());
  return ok(out);
}

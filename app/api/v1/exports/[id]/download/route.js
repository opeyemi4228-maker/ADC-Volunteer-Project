import { all, one, run, nowIso } from "@/lib/db";
import { open } from "@/lib/crypto";
import { getViewer, clientIp } from "@/lib/auth";
import { scopeSql, areaSql } from "@/lib/scope";
import { placeLabel, areaTypeOf } from "@/lib/geo";
import { onlyFilters } from "@/lib/volunteer-columns";
import { volunteerFile, fileResponse } from "@/lib/volunteer-export";
import { formatPhone } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/http";

/**
 * GET /api/v1/exports/{id}/download?token=…
 * Only the person who asked, only after approval, only before the link
 * expires, and only once. Every row is watermarked with the requester's name.
 * Volunteer exports are built exactly like the national admin's direct
 * download, from the filters, columns and format saved with the request.
 */
const csv = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request, { params }) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in to download.");
  const { id } = await params;
  const t = new URL(request.url).searchParams.get("token");
  const e = await one("SELECT * FROM exports WHERE id = :id", { id });
  if (!e || e.status !== "approved" || e.token !== t || e.requested_by !== viewer.id) return fail(404, "This download link is not valid.");
  if (e.expires_at < nowIso()) return fail(410, "This download link has expired. Request a new export.");
  if (e.downloaded_at) return fail(410, "This export has already been downloaded. Request a new one if you need it again.");

  const stored = JSON.parse(e.filters);
  if (e.kind === "volunteers") {
    const file = await volunteerFile(viewer, onlyFilters(stored), { columns: stored.columns, format: stored.format, ref: `export ${e.id.slice(0, 8)}` });
    await run("UPDATE exports SET downloaded_at = :now WHERE id = :id", { now: nowIso(), id });
    await audit(viewer, "export_downloaded", "export", id, { rows: file.count, format: stored.format ?? "csv", personal: file.personal }, await clientIp());
    return fileResponse(file);
  }

  const { area } = stored;
  const type = areaTypeOf(area);
  const stamp = `Exported for ${viewer.name} on ${nowIso()} UTC (export ${e.id.slice(0, 8)}). Confidential: campaign use only.`;
  const s = scopeSql(viewer, "group", "g");
  const a = areaSql("group", type, area, "g");
  const rows = await all(`SELECT g.* FROM support_groups g WHERE ${s.sql} AND ${a.sql} ORDER BY g.name`, { ...s.params, ...a.params });
  const lines = [["group_id", "name", "category", "level", "place", "status", "coordinator", "coordinator_phone", "exported_for"]];
  for (const g of rows) {
    const l = await one("SELECT first_name, surname, phone_enc FROM group_leaders WHERE group_id = :id AND position = 'coordinator' LIMIT 1", { id: g.id });
    lines.push([g.public_id, g.name, g.category, g.operating_level, placeLabel(g), g.status, l ? `${l.first_name} ${l.surname}` : "", l ? formatPhone(open(l.phone_enc)) : "", viewer.name]);
  }
  await run("UPDATE exports SET downloaded_at = :now WHERE id = :id", { now: nowIso(), id });
  await audit(viewer, "export_downloaded", "export", id, { rows: lines.length - 1 }, await clientIp());
  const body = `# ${stamp}\n${lines.map((r) => r.map(csv).join(",")).join("\n")}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adc-${e.kind}-${area}-${nowIso().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

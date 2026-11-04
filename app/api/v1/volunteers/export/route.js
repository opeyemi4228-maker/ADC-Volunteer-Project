import { clientIp } from "@/lib/auth";
import { uuid } from "@/lib/crypto";
import { onlyFilters } from "@/lib/volunteer-columns";
import { volunteerFile, fileResponse } from "@/lib/volunteer-export";
import { audit } from "@/lib/audit";
import { fail, requirePower } from "@/lib/http";

/**
 * GET /api/v1/volunteers/export?format=csv|xlsx&cols=a,b,c&<directory filters>
 * The national admin's direct download of what the directory shows. Everyone
 * else asks through /api/v1/exports and waits for approval. Each download is
 * watermarked and recorded in the audit log with its filters and row count.
 */
export async function GET(request) {
  const { viewer, denied } = await requirePower("approve_export");
  if (denied) return denied;
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const filters = onlyFilters(sp);
  const format = sp.format === "xlsx" ? "xlsx" : "csv";
  const ref = `download ${uuid().slice(0, 8)}`;
  const file = await volunteerFile(viewer, filters, { columns: sp.cols, format, ref });
  if (!file.count) return fail(404, "No volunteers match these filters.");
  await audit(viewer, "volunteers_downloaded", "export", null, { ref, filters, format, rows: file.count, columns: file.columns, personal: file.personal }, await clientIp());
  return fileResponse(file);
}

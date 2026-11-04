import { nowIso } from "./db.js";
import { areaName } from "./geo.js";
import { volunteerExport } from "./workspace-data.js";
import { pickColumns, describeFilters } from "./volunteer-columns.js";
import { xlsx } from "./xlsx.js";

/**
 * Builds a volunteer download (CSV or Excel) for one viewer. Used by the
 * national admin's direct download and by approved export requests, so both
 * produce the same file. Rows are limited by the viewer's scope exactly as
 * the directory is, and every row carries the name of the person it was
 * exported for.
 */

export const MAX_EXPORT_ROWS = 100000;

const csvCell = (v) => {
  const s = String(v ?? "");
  // A leading = + - @ would run as a formula in Excel; prefix it so it stays text.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function volunteerFile(viewer, filters, { columns, format = "csv", ref }) {
  const cols = pickColumns(columns);
  const rows = await volunteerExport(viewer, filters, { limit: MAX_EXPORT_ROWS });
  const at = nowIso();
  const header = [...cols, { key: "exported_for", label: "Exported for", width: 22 }];
  const data = rows.map((v) => [...cols.map((c) => c.value(v)), viewer.name]);
  const described = describeFilters(filters, areaName);
  const stamp = `Exported for ${viewer.name} on ${at} UTC (${ref}). Confidential: campaign use only.`;
  const slug = String(filters.area || "all").toLowerCase();
  const filename = `adc-volunteers-${slug}-${at.slice(0, 10)}`;

  let body;
  let contentType;
  let ext;
  if (format === "xlsx") {
    body = xlsx([
      { name: "Volunteers", columns: header, rows: data },
      {
        name: "About this export",
        filter: false,
        columns: [{ label: "Item", width: 22 }, { label: "Detail", width: 90 }],
        rows: [
          ["Exported for", viewer.name],
          ["Exported at", `${at} UTC`],
          ["Reference", ref],
          ["Records", String(rows.length)],
          ["Area", filters.area ? areaName(filters.area) : "Everywhere the requester coordinates"],
          ...described.filter((d) => d.key !== "area").map((d) => [d.label, d.value]),
          ["Notice", "Contains personal data under the NDPA 2023. Campaign use only. Do not forward, upload or share. Delete when no longer needed."],
        ],
      },
    ]);
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    ext = "xlsx";
  } else {
    // The byte-order mark makes Excel read the file as UTF-8, so names like Ọlabisi survive.
    body = `﻿# ${stamp}\n${[header.map((c) => c.label), ...data].map((r) => r.map(csvCell).join(",")).join("\n")}\n`;
    contentType = "text/csv; charset=utf-8";
    ext = "csv";
  }
  return {
    body,
    contentType,
    filename: `${filename}.${ext}`,
    count: rows.length,
    columns: cols.map((c) => c.key),
    personal: cols.some((c) => c.personal),
  };
}

export function fileResponse(file) {
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
      "X-Record-Count": String(file.count),
    },
  });
}

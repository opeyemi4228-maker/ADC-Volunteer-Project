import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/guard";
import { all, nowIso } from "@/lib/db";
import { areaName, childAreas, stateList, statesInZone } from "@/lib/geo";
import { Card, StatusBadge, dateLabel } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import { ApiButton } from "@/components/workspace/actions";
import ExportRequest from "./ExportRequest";

export const metadata = { title: "Reports and exports" };

function areas(viewer) {
  const out = [];
  for (const r of viewer.roles) {
    if (r.role === "national_admin") out.push(...stateList.map((s) => ({ value: s.code, label: s.name })));
    if (r.role === "zonal_coordinator") out.push(...statesInZone(r.area_code).map((c) => ({ value: c, label: areaName(c) })));
    if (r.role === "state_coordinator") {
      out.push({ value: r.area_code, label: `${areaName(r.area_code)} (whole state)` });
      out.push(...childAreas("state", r.area_code).map((c) => ({ value: c.code, label: c.name })));
    }
  }
  return out;
}

export default async function ExportsPage() {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("request_export")) redirect("/workspace");
  const approver = viewer.powers.includes("approve_export");
  const list = all(`SELECT * FROM exports WHERE requested_by = :u OR :admin = 1 ORDER BY created_at DESC LIMIT 50`, { u: viewer.id, admin: approver ? 1 : 0 });
  const now = nowIso();

  return (
    <>
      <PageHeader title="Reports and exports" description="Exports contain personal data. Every export needs national admin approval, is watermarked with your name, can be downloaded once within 24 hours, and is recorded in the audit log." />
      <div className="grid gap-8 xl:grid-cols-[1fr_1.4fr]">
        <ExportRequest areas={areas(viewer)} />
        <section>
          <h2 className="h-section">Requests</h2>
          {list.length === 0 ? <p className="mt-2 text-ink-muted">No export requests yet.</p> : (
            <ul className="mt-3 space-y-3">
              {list.map((e) => {
                const { area } = JSON.parse(e.filters);
                const expired = e.status === "approved" && e.expires_at < now;
                return (
                  <li key={e.id}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold capitalize">{e.kind} · {areaName(area)}</p>
                        <StatusBadge status={expired ? "expired" : e.downloaded_at ? "done" : e.status} label={e.downloaded_at ? "Downloaded" : undefined} />
                      </div>
                      <p className="mt-1 text-[14px] text-ink-muted">{e.requester_name} · {dateLabel(e.created_at)}{e.approver_name ? ` · ${e.status === "rejected" ? "rejected" : "approved"} by ${e.approver_name}` : ""}</p>
                      <p className="mt-2 text-[15px]">&ldquo;{e.reason}&rdquo;</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {approver && e.status === "awaiting_approval" && e.requested_by !== viewer.id && (
                          <>
                            <ApiButton url={`/api/v1/exports/${e.id}/approve`} data={{ decision: "approve" }} className="btn btn-primary btn-sm" doneLabel="Approved">Approve</ApiButton>
                            <ApiButton url={`/api/v1/exports/${e.id}/approve`} data={{ decision: "reject" }} className="btn btn-ghost btn-sm" doneLabel="Rejected">Reject</ApiButton>
                          </>
                        )}
                        {e.status === "approved" && !expired && !e.downloaded_at && e.requested_by === viewer.id && (
                          <a className="btn btn-primary btn-sm" href={`/api/v1/exports/${e.id}/download?token=${e.token}`}>Download CSV (expires {dateLabel(e.expires_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})</a>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

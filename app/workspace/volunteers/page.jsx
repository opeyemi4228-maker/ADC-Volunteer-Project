import Link from "next/link";
import { AlertTriangle, HandHeart } from "lucide-react";

import { getViewer } from "@/lib/auth";
import { volunteerRows } from "@/lib/workspace-data";
import { VOLUNTEER_ROLES, PVC_STATUS, labelOf } from "@/lib/options";
import { Card, EmptyState, StatusBadge, dateLabel } from "@/components/ui";
import { PageHeader, FilterBar, FilterSelect, FilterSearch, Pagination, withParams } from "@/components/workspace/ui";
import { ApiButton } from "@/components/workspace/actions";

export const metadata = { title: "Volunteers" };

const STATUSES = [
  { value: "verified", label: "Verified" },
  { value: "pending", label: "Pending" },
  { value: "info_requested", label: "More info requested" },
  { value: "rejected", label: "Rejected" },
];
const CHANNELS = [
  { value: "web", label: "Website" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ussd", label: "USSD" },
  { value: "field_agent", label: "Field agent" },
];

export default async function VolunteersPage({ searchParams }) {
  const viewer = await getViewer();
  const sp = await searchParams;
  const list = volunteerRows(viewer, sp);
  const groupCoordinator = viewer.powers.includes("approve_members") && !viewer.powers.includes("verify");

  return (
    <>
      <PageHeader
        title="Volunteers"
        description={groupCoordinator ? "People who joined your group. Approve the ones you know are members." : "Everyone registered in your area. Filter by role, PVC and polling unit to plan your work."}
      />
      <FilterBar action="/workspace/volunteers" reset="/workspace/volunteers">
        <FilterSearch value={sp.q} placeholder="Name or volunteer ID" />
        <FilterSelect name="status" label="Status" value={sp.status} options={STATUSES} />
        <FilterSelect name="role" label="Role" value={sp.role} options={VOLUNTEER_ROLES} />
        <FilterSelect name="pvc" label="PVC" value={sp.pvc} options={PVC_STATUS} />
        <FilterSelect name="channel" label="Channel" value={sp.channel} options={CHANNELS} />
        <label className="flex min-h-10 items-center gap-2 text-[14px] font-medium">
          <input type="checkbox" name="nopu" value="1" defaultChecked={Boolean(sp.nopu)} className="size-5 accent-brand-700" /> No polling unit
        </label>
        <label className="flex min-h-10 items-center gap-2 text-[14px] font-medium">
          <input type="checkbox" name="unaffiliated" value="1" defaultChecked={Boolean(sp.unaffiliated)} className="size-5 accent-brand-700" /> Not in a group
        </label>
      </FilterBar>

      {list.rows.length === 0 ? (
        <EmptyState icon={HandHeart} title="No volunteers match">Try clearing the filters.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-clean">
            <thead>
              <tr>
                <th>Volunteer</th>
                <th>Votes in</th>
                <th>Polling unit</th>
                <th>PVC</th>
                <th>Roles</th>
                <th>Group</th>
                <th>Registered</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((v) => (
                <tr key={v.id}>
                  <td className="min-w-44">
                    <Link href={`/workspace/volunteers/${v.id}`} className="font-semibold text-brand-800 hover:underline">{v.first_name} {v.surname}</Link>
                    <div className="text-[13px] text-ink-muted">{v.public_id}</div>
                    {v.flags > 0 && <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-warning"><AlertTriangle aria-hidden className="size-3.5" /> Possible duplicate</div>}
                  </td>
                  <td className="min-w-40 text-[14px]">{v.place}</td>
                  <td className="text-[14px]">{v.vote_pu_code ? v.vote_pu_code.slice(-3) : <span className="text-warning">None</span>}</td>
                  <td className="text-[14px]">{v.pvc_status === "yes" ? "Yes" : v.pvc_status === "not_collected" ? "Not collected" : "Not registered"}</td>
                  <td className="min-w-40 text-[13px]">{v.roles.map((r) => labelOf(VOLUNTEER_ROLES, r)).join(", ")}</td>
                  <td className="text-[14px]">{v.group_name ?? "—"}</td>
                  <td className="whitespace-nowrap text-[14px]">{dateLabel(v.created_at)}</td>
                  <td>
                    <StatusBadge status={v.status} />
                    {groupCoordinator && v.status !== "rejected" && (
                      <div className="mt-1"><ApiButton url={`/api/v1/volunteers/${v.id}/approve-member`} className="btn btn-ghost btn-sm" doneLabel="Approved">Approve member</ApiButton></div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={list.page} pages={list.pages} total={list.total} hrefFor={(p) => withParams("/workspace/volunteers", sp, { page: p })} />
    </>
  );
}

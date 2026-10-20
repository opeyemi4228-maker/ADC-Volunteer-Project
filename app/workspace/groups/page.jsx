import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";

import { getViewer } from "@/lib/auth";
import { groupRows } from "@/lib/workspace-data";
import { GROUP_CATEGORIES, OPERATING_LEVELS, GROUP_SIZE, labelOf } from "@/lib/options";
import { Card, EmptyState, StatusBadge, fmt, dateLabel } from "@/components/ui";
import { PageHeader, FilterBar, FilterSelect, FilterSearch, Pagination, withParams } from "@/components/workspace/ui";

export const metadata = { title: "Groups" };

const STATUSES = [
  { value: "verified", label: "Verified" },
  { value: "pending", label: "Pending" },
  { value: "info_requested", label: "More info requested" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

export default async function GroupsPage({ searchParams }) {
  const viewer = await getViewer();
  const sp = await searchParams;
  const list = groupRows(viewer, sp);

  return (
    <>
      <PageHeader title="Support groups" description="Every group in your area. Member counts show verified volunteers against the size the group claimed." />
      <FilterBar action="/workspace/groups" reset="/workspace/groups">
        <FilterSearch value={sp.q} placeholder="Name, group ID or join code" />
        <FilterSelect name="status" label="Status" value={sp.status} options={STATUSES} />
        <FilterSelect name="category" label="Category" value={sp.category} options={GROUP_CATEGORIES} />
        <FilterSelect name="level" label="Level" value={sp.level} options={OPERATING_LEVELS} />
      </FilterBar>

      {list.rows.length === 0 ? (
        <EmptyState icon={Users} title="No groups match">Try clearing the filters.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-clean">
            <thead>
              <tr>
                <th>Group</th>
                <th>Category</th>
                <th>Place</th>
                <th className="text-right">Verified members</th>
                <th>Claimed size</th>
                <th>Online</th>
                <th>Registered</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((g) => (
                <tr key={g.id}>
                  <td className="min-w-52">
                    <Link href={`/workspace/groups/${g.id}`} className="font-semibold text-brand-800 hover:underline">{g.name}</Link>
                    <div className="text-[13px] text-ink-muted">{g.public_id} · {labelOf(OPERATING_LEVELS, g.operating_level)}</div>
                    {g.flags > 0 && <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-warning"><AlertTriangle aria-hidden className="size-3.5" /> Possible duplicate</div>}
                  </td>
                  <td>{labelOf(GROUP_CATEGORIES, g.category)}</td>
                  <td className="min-w-44 text-[14px]">{g.place}</td>
                  <td className="num text-right">{fmt(g.verified_members)}</td>
                  <td className="whitespace-nowrap">{labelOf(GROUP_SIZE, g.estimated_size_range)}</td>
                  <td>{g.has_online_platform ? "Yes" : g.has_online_platform === 0 ? "No" : "—"}</td>
                  <td className="whitespace-nowrap text-[14px]">{dateLabel(g.created_at)}</td>
                  <td><StatusBadge status={g.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={list.page} pages={list.pages} total={list.total} hrefFor={(p) => withParams("/workspace/groups", sp, { page: p })} />
    </>
  );
}

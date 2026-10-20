import { Images } from "lucide-react";

import { requireViewer } from "@/lib/guard";
import { all, scalar } from "@/lib/db";
import { scopeSql } from "@/lib/scope";
import { placeLabel, stateList } from "@/lib/geo";
import { EmptyState } from "@/components/ui";
import { PageHeader, Tabs, FilterBar, FilterSelect, FilterSearch, Pagination, withParams } from "@/components/workspace/ui";
import MediaGrid from "@/components/workspace/MediaGrid";

export const metadata = { title: "Media library" };
const PAGE = 24;

export default async function MediaPage({ searchParams }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const status = sp.status ?? (viewer.powers.includes("moderate_media") ? "pending" : "approved");
  const page = Math.max(1, Number(sp.page) || 1);
  const s = scopeSql(viewer, "media", "m");
  const where = `${s.sql} AND m.moderation_status = :status AND (:state = '' OR m.state_code = :state) AND (:kind = '' OR m.kind = :kind)
    AND (:q = '' OR m.event_name LIKE :ql OR g.name LIKE :ql OR m.caption LIKE :ql)`;
  const params = { ...s.params, status, state: sp.state ?? "", kind: sp.kind ?? "", q: sp.q ?? "", ql: `%${sp.q ?? ""}%` };
  const items = all(
    `SELECT m.*, g.name AS group_name FROM media_items m LEFT JOIN support_groups g ON g.id = m.group_id WHERE ${where}
     ORDER BY ${status === "pending" ? "m.created_at ASC" : "m.event_date DESC"} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
    params,
  ).map((m) => ({ ...m, place: placeLabel(m) }));
  const total = scalar(`SELECT COUNT(*) FROM media_items m LEFT JOIN support_groups g ON g.id = m.group_id WHERE ${where}`, params);
  const count = (st) => scalar(`SELECT COUNT(*) FROM media_items m WHERE ${s.sql} AND m.moderation_status = :st`, { ...s.params, st });

  const tabs = [
    viewer.powers.includes("moderate_media") && { key: "pending", label: "Pending review", count: count("pending") },
    { key: "approved", label: "Approved", count: count("approved") },
    { key: "publicity", label: "Approved for publicity", count: count("publicity") },
    { key: "rejected", label: "Rejected", count: count("rejected") },
  ].filter(Boolean).map((t) => ({ ...t, href: withParams("/workspace/media", { ...sp, page: undefined }, { status: t.key }) }));

  return (
    <>
      <PageHeader title="Media library" description="Photos and videos from groups and activities. Everything is reviewed before it appears in public galleries, and the media directorate clears items for campaign channels (credit to the group)." />
      <Tabs tabs={tabs} current={status} />
      <FilterBar action="/workspace/media" reset={`/workspace/media?status=${status}`}>
        <input type="hidden" name="status" value={status} />
        <FilterSearch value={sp.q} placeholder="Event, group or caption" />
        <FilterSelect name="state" label="State" value={sp.state} options={stateList.map((x) => ({ value: x.code, label: x.name }))} />
        <FilterSelect name="kind" label="Type" value={sp.kind} options={[{ value: "photo", label: "Photos" }, { value: "video", label: "Videos" }, { value: "link", label: "Video links" }]} />
      </FilterBar>
      {items.length === 0 ? (
        <EmptyState icon={Images} title={status === "pending" ? "Nothing to review" : "No media here yet"}>
          {status === "pending" ? "New uploads in your area will appear here." : "Add photos from your next meeting or outreach."}
        </EmptyState>
      ) : (
        <MediaGrid items={items} canModerate={viewer.powers.includes("moderate_media")} canPublicity={viewer.powers.includes("publicity")} showGroup />
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} hrefFor={(p) => withParams("/workspace/media", { ...sp, status }, { page: p })} />
    </>
  );
}

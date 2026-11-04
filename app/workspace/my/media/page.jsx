import Link from "next/link";
import { Film, Link2 } from "lucide-react";

import { requireVolunteer } from "@/lib/guard";
import { mediaBy, volunteerContext } from "@/lib/volunteer-portal";
import { EmptyState, StatusBadge, dateLabel, fmt } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";

export const metadata = { title: "Photos and videos" };

const STATUS = { pending: "Waiting for review", approved: "Accepted", publicity: "Accepted for publicity", rejected: "Not accepted" };

/** Every photo and video this volunteer has sent, with what the Super Admin decided. */
export default async function MyMedia() {
  const { volunteerId } = await requireVolunteer();
  const [v, items] = await Promise.all([volunteerContext(volunteerId), mediaBy(volunteerId)]);
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, items.filter((m) => m.moderation_status === k).length]));

  return (
    <>
      <PageHeader
        title="Photos and videos"
        description="Everything you have sent with your activity and task reports. Accepted photos can appear in your group's gallery and campaign materials."
        actions={v.canReport && <Link href="/workspace/my/activities/new" className="btn btn-secondary btn-sm">Report an activity with photos</Link>}
      />
      {items.length > 0 && (
        <p className="mb-4 text-[14px] text-ink-muted num">
          {fmt(items.length)} sent · {fmt(counts.approved + counts.publicity)} accepted · {fmt(counts.pending)} waiting · {fmt(counts.rejected)} not accepted
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title="No photos or videos yet">Add them when you report an activity or progress on a task.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <li key={m.id} className="card overflow-hidden">
              <div className="relative aspect-[4/3] bg-surface-alt">
                {m.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/v1/media/${m.id}/file?size=thumb`} alt={m.caption ?? m.event_name ?? "Your photo"} className="size-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid size-full place-items-center text-ink-muted">
                    {m.kind === "video" ? <Film aria-hidden className="size-8" /> : <Link2 aria-hidden className="size-8" />}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 p-3">
                <StatusBadge status={m.moderation_status} label={STATUS[m.moderation_status]} />
                <p className="truncate text-[13px] font-medium" title={m.event_name}>{m.event_name || "Untitled"}</p>
                <p className="text-[12px] text-ink-muted">{dateLabel(m.created_at)}</p>
                {m.rejection_reason && <p className="text-[12px] text-danger">{m.rejection_reason}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

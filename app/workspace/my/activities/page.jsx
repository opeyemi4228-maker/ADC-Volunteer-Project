import Link from "next/link";
import { CalendarCheck, Images, MapPin, Plus, Users } from "lucide-react";

import { requireVolunteer } from "@/lib/guard";
import { volunteerContext, activitiesBy } from "@/lib/volunteer-portal";
import { ACTIVITY_TYPES, labelOf } from "@/lib/options";
import { Alert, EmptyState, StatusBadge, dateLabel, fmt } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";

export const metadata = { title: "My activities" };

const REVIEW = { submitted: ["pending", "Waiting for review"], approved: ["approved", "Accepted"], rejected: ["rejected", "Not accepted"] };

/** What this volunteer has reported, and what the Super Admin made of it. */
export default async function MyActivities({ searchParams }) {
  const { volunteerId } = await requireVolunteer();
  const sp = await searchParams;
  const v = await volunteerContext(volunteerId);
  const list = await activitiesBy(volunteerId);

  return (
    <>
      <PageHeader
        title="My activities"
        description="Everything you have reported. The Super Admin reviews each one."
        actions={v.canReport && <Link href="/workspace/my/activities/new" className="btn btn-primary btn-sm"><Plus aria-hidden className="size-4" /> Report an activity</Link>}
      />
      {sp.reported && <Alert tone="success" className="mb-5" title={`Activity ${sp.reported} sent`}>Thank you. It is now waiting for the Super Admin's review.</Alert>}
      {!v.canReport && <Alert tone="info" className="mb-5" title="You can report once you are verified">Your registration is being checked.</Alert>}
      {list.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Nothing reported yet" action={v.canReport && <Link href="/workspace/my/activities/new" className="btn btn-primary btn-sm">Report your first activity</Link>}>
          Held a meeting, knocked on doors or ran an online campaign? Report it here with photos.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const [status, label] = REVIEW[a.review_status] ?? REVIEW.submitted;
            return (
              <li key={a.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-bold leading-6">{a.title || labelOf(ACTIVITY_TYPES, a.type)}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
                      <span>{labelOf(ACTIVITY_TYPES, a.type)} · {dateLabel(a.date)}</span>
                      <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="size-3.5" /> {a.place}</span>
                      {a.attendance != null && <span className="inline-flex items-center gap-1"><Users aria-hidden className="size-3.5" /> {fmt(a.attendance)} attended</span>}
                      {a.media > 0 && <span className="inline-flex items-center gap-1"><Images aria-hidden className="size-3.5" /> {fmt(a.media)}</span>}
                    </p>
                  </div>
                  <StatusBadge status={status} label={label} />
                </div>
                {a.description && <p className="mt-3 text-[15px]">{a.description}</p>}
                {a.review_note && <p className="mt-3 rounded-lg bg-surface-alt p-3 text-[14px]"><span className="font-semibold">Super Admin:</span> {a.review_note}</p>}
                <p className="mt-2 text-[12px] text-ink-muted num">{a.public_id}</p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

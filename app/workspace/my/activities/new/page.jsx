import { redirect } from "next/navigation";

import { requireVolunteer } from "@/lib/guard";
import { volunteerContext } from "@/lib/volunteer-portal";
import { PageHeader } from "@/components/workspace/ui";
import ActivityForm from "@/app/workspace/activities/new/ActivityForm";

export const metadata = { title: "Report an activity" };

/** A volunteer reports something they did, with photos. It goes to the Super Admin for review. */
export default async function ReportActivity() {
  const { volunteerId } = await requireVolunteer();
  const v = await volunteerContext(volunteerId);
  if (!v?.canReport) redirect("/workspace/my/activities");
  return (
    <>
      <PageHeader
        crumbs={[{ label: "My activities", href: "/workspace/my/activities" }, { label: "Report an activity" }]}
        title="Report an activity"
        description="A meeting, door-to-door round, rally or online campaign you took part in. It takes about two minutes, and the Super Admin reviews it."
      />
      <div className="max-w-3xl">
        <ActivityForm groups={[]} defaultLocation={{ state: v.vote_state_code, lga: v.vote_lga_code, ward: v.vote_ward_code }} doneHref="/workspace/my/activities" />
      </div>
    </>
  );
}

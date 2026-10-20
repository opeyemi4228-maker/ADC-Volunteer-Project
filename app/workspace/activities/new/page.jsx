import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/guard";
import { all } from "@/lib/db";
import { scopeSql } from "@/lib/scope";
import { PageHeader } from "@/components/workspace/ui";
import ActivityForm from "./ActivityForm";

export const metadata = { title: "Report an activity" };

export default async function NewActivity({ searchParams }) {
  const viewer = await requireViewer();
  if (!viewer.powers.includes("log_activity")) redirect("/workspace/activities");
  const sp = await searchParams;
  const s = scopeSql(viewer, "group", "g");
  const groups = all(`SELECT g.id, g.name, g.state_code, g.lga_code, g.ward_code FROM support_groups g WHERE g.status = 'verified' AND ${s.sql} ORDER BY g.name LIMIT 300`, s.params);
  const chosen = sp.group ? groups.find((g) => g.id === sp.group) : groups.length === 1 ? groups[0] : null;
  const home = viewer.roles.find((r) => ["ward", "lga", "state"].includes(r.area_type));
  const location = chosen
    ? { state: chosen.state_code, lga: chosen.lga_code ?? "", ward: chosen.ward_code ?? "" }
    : home ? { state: home.area_code.slice(0, 3), lga: home.area_code.length >= 7 ? home.area_code.slice(0, 7) : "", ward: home.area_code.length === 10 ? home.area_code : "" } : {};
  return (
    <>
      <PageHeader crumbs={[{ label: "Activities", href: "/workspace/activities" }, { label: "Report an activity" }]} title="Report an activity" description="Meetings, outreaches, door-to-door and online campaigns. It takes about two minutes." />
      <div className="max-w-3xl">
        <ActivityForm groups={[]} defaultGroup={undefined} defaultLocation={location} />
      </div>
    </>
  );
}

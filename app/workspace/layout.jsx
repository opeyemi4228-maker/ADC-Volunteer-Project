import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { isVolunteerOnly } from "@/lib/guard";
import { scalar, getSetting } from "@/lib/db";
import { scopeSql, homeArea } from "@/lib/scope";
import { areaName } from "@/lib/geo";
import { ROLE_LABELS, SUPERVISING_BODY, DIRECTORATES, labelOf } from "@/lib/options";
import { volunteerContext, tasksFor } from "@/lib/volunteer-portal";
import WorkspaceShell from "@/components/workspace/Shell";
import "./workspace.css";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Workspace", template: "%s · ADC Workspace" }, robots: { index: false } };

export default async function WorkspaceLayout({ children }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const home = homeArea(viewer);
  const volunteerMode = isVolunteerOnly(viewer);
  const v = scopeSql(viewer, "volunteer");
  const m = scopeSql(viewer, "media");
  const a = scopeSql(viewer, "activity");
  const can = (p) => viewer.powers.includes(p);
  let counts;
  let areaLabel;
  if (volunteerMode) {
    // A volunteer's badges: tasks still waiting for their report, and this week's messages.
    const me = await volunteerContext(home.code);
    const [tasks, inbox] = me
      ? await Promise.all([
        tasksFor(me).then((list) => list.filter((x) => x.status === "open" && !x.lastReport).length),
        scalar(
          `SELECT COUNT(*) FROM message_recipients r JOIN messages m ON m.id = r.message_id
           WHERE r.volunteer_id = :v AND m.status = 'sent' AND COALESCE(m.sent_at, m.created_at) >= now() - interval '7 days'`,
          { v: me.id },
        ),
      ])
      : [0, 0];
    counts = { tasks: me?.canReport ? tasks : 0, inbox };
    areaLabel = me?.public_id ?? "";
  } else {
    // The Super Admin's waiting counts, fetched together.
    const [verify, media, activities, exports, messages] = await Promise.all([
      can("verify") ? scalar(`SELECT COUNT(*) FROM volunteers WHERE status IN ('pending','info_requested') AND ${v.sql}`, v.params) : 0,
      can("moderate_media") ? scalar(`SELECT COUNT(*) FROM media_items WHERE moderation_status = 'pending' AND ${m.sql}`, m.params) : 0,
      can("moderate_media") ? scalar(`SELECT COUNT(*) FROM activities WHERE review_status = 'submitted' AND ${a.sql}`, a.params) : 0,
      can("approve_export") ? scalar("SELECT COUNT(*) FROM exports WHERE status = 'awaiting_approval'") : 0,
      can("approve_messages") ? scalar("SELECT COUNT(*) FROM messages WHERE status = 'awaiting_approval'") : 0,
    ]);
    counts = { verify, media, activities, exports, messages };
    areaLabel = home?.type === "national" ? SUPERVISING_BODY
      : home?.type === "directorate" ? `${labelOf(DIRECTORATES, home.code)} directorate`
        : home?.type === "agent" ? "Field registrations" : areaName(home?.code);
  }

  return (
    <WorkspaceShell
      viewer={{ name: viewer.name, powers: viewer.powers, roles: [...new Set(viewer.roles.map((r) => ROLE_LABELS[r.role] ?? r.role))] }}
      areaLabel={areaLabel}
      counts={counts}
      electionOn={await getSetting("election_day_enabled", false)}
      volunteerMode={volunteerMode}
    >
      {children}
    </WorkspaceShell>
  );
}

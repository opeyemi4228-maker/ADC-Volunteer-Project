import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { isVolunteerOnly } from "@/lib/guard";
import { getT } from "@/lib/i18n/server";
import { scalar, getSetting } from "@/lib/db";
import { scopeSql, homeArea } from "@/lib/scope";
import { areaName } from "@/lib/geo";
import { ROLE_LABELS, DIRECTORATES, labelOf } from "@/lib/options";
import WorkspaceShell from "@/components/workspace/Shell";
import "./workspace.css";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Workspace", template: "%s · ADC Workspace" }, robots: { index: false } };

export default async function WorkspaceLayout({ children }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const t = await getT();

  const home = homeArea(viewer);
  const v = scopeSql(viewer, "volunteer");
  const m = scopeSql(viewer, "media");
  const can = (p) => viewer.powers.includes(p);
  const counts = {
    verify: can("verify")
      ? scalar(`SELECT COUNT(*) FROM volunteers WHERE status IN ('pending','info_requested') AND ${v.sql}`, v.params)
      : 0,
    media: can("moderate_media") ? scalar(`SELECT COUNT(*) FROM media_items WHERE moderation_status = 'pending' AND ${m.sql}`, m.params) : 0,
    exports: can("approve_export") ? scalar("SELECT COUNT(*) FROM exports WHERE status = 'awaiting_approval'") : 0,
    messages: can("approve_messages") ? scalar("SELECT COUNT(*) FROM messages WHERE status = 'awaiting_approval'") : 0,
  };

  const areaLabel =
    home?.type === "directorate" ? `${labelOf(DIRECTORATES, home.code)} directorate`
      : home?.type === "volunteer" ? scalar("SELECT public_id FROM volunteers WHERE id = :id", { id: home.code })
        : home?.type === "agent" ? t("Field registrations") : areaName(home?.code);

  return (
    <WorkspaceShell
      viewer={{ name: viewer.name, powers: viewer.powers, roles: [...new Set(viewer.roles.map((r) => ROLE_LABELS[r.role] ?? r.role))] }}
      areaLabel={areaLabel}
      counts={counts}
      electionOn={getSetting("election_day_enabled", false)}
      volunteerMode={isVolunteerOnly(viewer)}
    >
      {children}
    </WorkspaceShell>
  );
}

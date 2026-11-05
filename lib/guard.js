import { redirect } from "next/navigation";

import { getViewer } from "./auth.js";
import { isVolunteerOnly } from "./scope.js";

export { isVolunteerOnly };

/**
 * The signed-in account, or a redirect to sign in.
 * Next renders a page alongside its layout, so each workspace page checks for
 * itself rather than relying on the layout's redirect having run first.
 * Super Admin pages send a volunteer back to their own dashboard.
 */
export async function requireViewer({ allowVolunteer = false } = {}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!allowVolunteer && isVolunteerOnly(viewer)) redirect("/workspace");
  return viewer;
}

/**
 * A signed-in volunteer and their volunteer record id, for the volunteer's own
 * pages. Anyone else goes to the workspace overview.
 */
export async function requireVolunteer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const own = viewer.roles.find((r) => r.role === "volunteer");
  if (!isVolunteerOnly(viewer) || !own) redirect("/workspace");
  return { viewer, volunteerId: own.area_code };
}

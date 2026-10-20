import { redirect } from "next/navigation";

import { getViewer } from "./auth.js";

/** True for a volunteer's own account (no coordinator role alongside it). */
export const isVolunteerOnly = (viewer) => viewer.roles.length > 0 && viewer.roles.every((r) => r.role === "volunteer");

/**
 * The signed-in coordinator, or a redirect to sign in.
 * Next renders a page alongside its layout, so each workspace page checks for
 * itself rather than relying on the layout's redirect having run first.
 * A volunteer's account only has the dashboard; coordinator pages send it back there.
 */
export async function requireViewer({ allowVolunteer = false } = {}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!allowVolunteer && isVolunteerOnly(viewer)) redirect("/workspace");
  return viewer;
}

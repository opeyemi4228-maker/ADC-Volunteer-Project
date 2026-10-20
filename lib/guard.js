import { redirect } from "next/navigation";

import { getViewer } from "./auth.js";

/**
 * The signed-in coordinator or group account, or a redirect to sign in.
 * Next renders a page alongside its layout, so each workspace page checks for
 * itself rather than relying on the layout's redirect having run first.
 */
export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

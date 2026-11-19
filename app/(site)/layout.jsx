import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import { getViewer } from "@/lib/auth";
import { isVolunteerOnly } from "@/lib/scope";

/**
 * The public site. The header knows whether someone is signed in, so a member
 * sees their dashboard and sign out instead of "Sign in" and "Volunteer".
 */
export default async function SiteLayout({ children }) {
  let account = null;
  try {
    const viewer = await getViewer();
    if (viewer) account = { name: viewer.name, volunteer: isVolunteerOnly(viewer) };
  } catch {
    // The public pages still show if the account can't be looked up.
  }
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <SiteHeader account={account} />
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

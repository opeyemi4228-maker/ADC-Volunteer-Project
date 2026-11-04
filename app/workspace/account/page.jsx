import { requireViewer } from "@/lib/guard";
import { one } from "@/lib/db";
import { open } from "@/lib/crypto";
import { formatPhone } from "@/lib/validate";
import { Card, dateLabel } from "@/components/ui";
import { PageHeader } from "@/components/workspace/ui";
import ChangePassword from "../ChangePassword";

export const metadata = { title: "Your account" };

/**
 * The signed-in coordinator's or Super Admin's own account: who they are
 * signed in as and their password. Volunteers have no password (they sign in
 * with a code), so they are sent back to their dashboard.
 */
export default async function AccountPage() {
  const viewer = await requireViewer();
  const u = await one("SELECT name, phone_enc, email_enc, last_signin_at FROM users WHERE id = :id", { id: viewer.id });
  const email = u?.email_enc ? open(u.email_enc) : null;
  return (
    <>
      <PageHeader title="Your account" description="The details you sign in with. Sign-in codes are sent to this phone number." />
      <div className="grid max-w-3xl gap-4">
        <Card className="p-5">
          <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
            <div><dt className="text-[13px] text-ink-muted">Name</dt><dd className="font-semibold">{u?.name}</dd></div>
            <div><dt className="text-[13px] text-ink-muted">Phone</dt><dd className="font-semibold">{u?.phone_enc ? formatPhone(open(u.phone_enc)) : "—"}</dd></div>
            {email && <div><dt className="text-[13px] text-ink-muted">Email</dt><dd className="font-semibold">{email}</dd></div>}
            {u?.last_signin_at && <div><dt className="text-[13px] text-ink-muted">Last signed in</dt><dd className="font-semibold">{dateLabel(u.last_signin_at)}</dd></div>}
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-bold tracking-tight">Password</h2>
          <p className="mt-1 text-[14px] text-ink-muted">If you were given a one-time password, change it to one only you know. Use at least 8 characters, with some letters.</p>
          <div className="mt-3"><ChangePassword defaultOpen /></div>
        </Card>
      </div>
    </>
  );
}

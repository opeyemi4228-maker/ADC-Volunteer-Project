import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { one } from "@/lib/db";
import { placeLabel } from "@/lib/geo";
import { GROUP_CATEGORIES, labelOf } from "@/lib/options";
import { Logo, dateLabel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify a certificate", robots: { index: false } };

/**
 * Public check for a printed certificate (the QR code on it opens this page).
 * Shows only what the certificate itself shows, never contact details.
 */
export default async function VerifyCertificate({ params }) {
  const { id } = await params;
  const g = one("SELECT public_id, name, category, status, verified_at, certificate_no, state_code, lga_code, ward_code FROM support_groups WHERE public_id = :id", { id: String(id).toUpperCase() });
  const valid = g?.status === "verified";
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Link href="/" className="flex items-center gap-2"><Logo size={34} /><span className="font-bold">ADC Volunteers System</span></Link>
      <div className={`mt-8 rounded-2xl border p-6 ${valid ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"}`}>
        <p className={`flex items-center gap-2 text-lg font-bold ${valid ? "text-success" : "text-danger"}`}>
          {valid ? <CheckCircle2 aria-hidden className="size-6" /> : <XCircle aria-hidden className="size-6" />}
          {valid ? "Genuine and valid" : g ? "Not currently valid" : "No group with this ID"}
        </p>
        {g ? (
          <dl className="mt-4 space-y-3 text-[15px] text-ink">
            <div><dt className="text-[13px] font-semibold text-ink-muted">Support group</dt><dd className="text-xl font-bold">{g.name}</dd></div>
            <div><dt className="text-[13px] font-semibold text-ink-muted">Group ID</dt><dd className="font-mono">{g.public_id}</dd></div>
            {g.certificate_no && <div><dt className="text-[13px] font-semibold text-ink-muted">Certificate No.</dt><dd className="font-mono">{g.certificate_no}</dd></div>}
            <div><dt className="text-[13px] font-semibold text-ink-muted">Category</dt><dd>{labelOf(GROUP_CATEGORIES, g.category)}</dd></div>
            <div><dt className="text-[13px] font-semibold text-ink-muted">Based in</dt><dd>{placeLabel(g)}</dd></div>
            {valid && <div><dt className="text-[13px] font-semibold text-ink-muted">Verified</dt><dd>{dateLabel(g.verified_at)}</dd></div>}
            {!valid && <p className="text-ink-muted">This group is not verified at the moment, so its certificate should not be relied on.</p>}
          </dl>
        ) : (
          <p className="mt-3 text-ink">Check the ID printed on the certificate. If it still isn&apos;t found, the certificate isn&apos;t genuine.</p>
        )}
      </div>
    </main>
  );
}

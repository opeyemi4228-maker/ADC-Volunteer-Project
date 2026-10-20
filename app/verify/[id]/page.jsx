import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { all, one } from "@/lib/db";
import { placeLabel } from "@/lib/geo";
import { certificateNumber, rolesLabel } from "@/lib/certificate";
import { Logo, dateLabel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify a certificate", robots: { index: false } };

/**
 * Public check for a printed certificate or ID card (the QR code on it opens
 * this page). Shows only what the certificate itself shows, never contact details.
 */
export default async function VerifyCertificate({ params }) {
  const { id } = await params;
  const v = one(
    "SELECT id, public_id, first_name, middle_name, surname, status, verified_at, vote_state_code, vote_lga_code, vote_ward_code FROM volunteers WHERE public_id = :id AND deletion_requested_at IS NULL",
    { id: String(id).toUpperCase() },
  );
  const valid = v?.status === "verified";
  const roles = v ? all("SELECT role FROM volunteer_roles WHERE volunteer_id = :v", { v: v.id }).map((r) => r.role) : [];
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Link href="/" className="flex items-center gap-2"><Logo size={34} /><span className="font-bold">ADC Volunteers System</span></Link>
      <div className={`mt-8 rounded-2xl border p-6 ${valid ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"}`}>
        <p className={`flex items-center gap-2 text-lg font-bold ${valid ? "text-success" : "text-danger"}`}>
          {valid ? <CheckCircle2 aria-hidden className="size-6" /> : <XCircle aria-hidden className="size-6" />}
          {valid ? "Genuine and valid" : v ? "Not currently valid" : "No volunteer with this ID"}
        </p>
        {v ? (
          <dl className="mt-4 space-y-3 text-[15px] text-ink">
            <div><dt className="text-[13px] font-semibold text-ink-muted">Volunteer</dt><dd className="break-words text-xl font-bold">{[v.first_name, v.middle_name, v.surname].filter(Boolean).join(" ")}</dd></div>
            <div><dt className="text-[13px] font-semibold text-ink-muted">Volunteer ID</dt><dd className="font-mono">{v.public_id}</dd></div>
            {valid && <div><dt className="text-[13px] font-semibold text-ink-muted">Certificate No.</dt><dd className="font-mono">{certificateNumber(v)}</dd></div>}
            <div><dt className="text-[13px] font-semibold text-ink-muted">Volunteering as</dt><dd>{rolesLabel(roles)}</dd></div>
            <div><dt className="text-[13px] font-semibold text-ink-muted">Based in</dt><dd>{placeLabel({ state_code: v.vote_state_code, lga_code: v.vote_lga_code, ward_code: v.vote_ward_code })}</dd></div>
            {valid && <div><dt className="text-[13px] font-semibold text-ink-muted">Verified</dt><dd>{dateLabel(v.verified_at)}</dd></div>}
            {!valid && <p className="text-ink-muted">This volunteer is not verified at the moment, so their certificate should not be relied on.</p>}
          </dl>
        ) : (
          <p className="mt-3 text-ink">Check the ID printed on the certificate. If it still isn&apos;t found, the certificate isn&apos;t genuine.</p>
        )}
      </div>
    </main>
  );
}

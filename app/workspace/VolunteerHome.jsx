import Link from "next/link";
import QRCode from "qrcode";
import { Check, Clock, CircleHelp, XCircle, Download, ShieldCheck, Lock } from "lucide-react";

import { all, one } from "@/lib/db";
import { open } from "@/lib/crypto";
import { placeLabel, puOf } from "@/lib/geo";
import { formatPhone } from "@/lib/validate";
import { certificateNumber } from "@/lib/certificate";
import { VOLUNTEER_ROLES, LANGUAGES, AVAILABILITY, CONTACT_CHANNELS, PVC_STATUS, labelOf } from "@/lib/options";
import { Card, Logo, StatusBadge, dateLabel, cx } from "@/components/ui";
import PrintCard from "./PrintCard";
import ChangePassword from "./ChangePassword";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * The dashboard a volunteer sees after signing in with their phone number (or
 * email) and password. It answers, in order: am I verified yet, where is my
 * volunteer ID card, where is my certificate, and what did I sign up for.
 */
export default async function VolunteerHome({ viewer, volunteerId }) {
  const v = one("SELECT * FROM volunteers WHERE id = :id", { id: volunteerId });
  if (!v) return <p>Volunteer record not found.</p>;
  const account = one("SELECT email_enc FROM users WHERE id = :id", { id: viewer.id });
  const email = open(account?.email_enc) || open(v.email_enc);
  const roles = all("SELECT role FROM volunteer_roles WHERE volunteer_id = :v", { v: v.id }).map((r) => r.role);
  const languages = all("SELECT language FROM volunteer_languages WHERE volunteer_id = :v", { v: v.id }).map((r) => r.language);
  const name = [v.first_name, v.middle_name, v.surname].filter(Boolean).join(" ");
  const place = placeLabel({ state_code: v.vote_state_code, lga_code: v.vote_lga_code, ward_code: v.vote_ward_code });
  const pu = v.vote_pu_code ? puOf(v.vote_pu_code) : null;
  const verified = v.status === "verified";
  const verifyUrl = `${SITE}/verify/${v.public_id}`;
  const qr = await QRCode.toString(verifyUrl, { type: "svg", margin: 0, color: { dark: "#063f20", light: "#ffffff" } });

  const steps = [
    { label: "Registered", done: true, when: dateLabel(v.created_at) },
    { label: "Under review", done: verified, current: ["pending", "info_requested"].includes(v.status) },
    { label: "Verified", done: verified, when: verified ? dateLabel(v.verified_at) : null },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-700 text-[22px] font-bold text-white" aria-hidden>
          {v.first_name[0]}{v.surname[0]}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="h-page break-words">Welcome, {v.first_name}</h1>
          <p className="mt-0.5 text-[15px] text-ink-muted"><span className="font-mono">{v.public_id}</span> · {place}</p>
        </div>
        <StatusBadge status={v.status} className="!text-[14px]" />
      </header>

      {/* Verification and certificate: the reason most people sign in. */}
      <Card id="certificate" className="scroll-mt-24 p-5 sm:p-7">
        <ol className="grid gap-3 sm:grid-cols-3" aria-label="Registration progress">
          {steps.map((st, i) => (
            <li key={st.label} className="flex items-center gap-3">
              <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-[14px] font-bold", st.done ? "bg-brand-700 text-white" : st.current ? "border-2 border-brand-700 text-brand-800" : "border border-line text-ink-muted")}>
                {st.done ? <Check aria-hidden className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span>
                <span className={cx("block text-[15px] font-semibold", !st.done && !st.current && "text-ink-muted")}>{st.label}</span>
                {st.when && <span className="block text-[13px] text-ink-muted">{st.when}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 border-t border-line pt-6">
          {verified && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <ShieldCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-success" />
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold">You&apos;re a verified ADC volunteer. Your certificate is ready.</p>
                  <p className="mt-1 break-words text-[14px] text-ink-muted">
                    Certificate No. {certificateNumber(v)}. Anyone can check it is genuine by scanning its QR code, or at{" "}
                    <Link className="link" href={`/verify/${v.public_id}`}>/verify/{v.public_id}</Link>.
                  </p>
                </div>
              </div>
              <a href={`/api/v1/volunteers/${v.id}/certificate`} className="btn btn-primary btn-lg"><Download aria-hidden className="size-5" /> Download certificate (PDF)</a>
            </div>
          )}
          {v.status === "pending" && (
            <p className="flex items-start gap-3 text-[15px]">
              <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
              <span>A coordinator in your ward will call you to confirm your details, usually within 7 days. {email ? <>We&apos;ll email <strong className="break-all">{email}</strong> and</> : "We'll"} send you an SMS as soon as you&apos;re verified, and your certificate will appear here.</span>
            </p>
          )}
          {v.status === "info_requested" && (
            <div className="flex items-start gap-3 text-[15px]">
              <CircleHelp aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
              <div>
                <p className="font-semibold">Your coordinator needs a little more information.</p>
                {v.status_reason && <p className="mt-1">&ldquo;{v.status_reason}&rdquo;</p>}
                <p className="mt-1 text-ink-muted">Watch for their SMS or call, or contact your ward coordinator.</p>
              </div>
            </div>
          )}
          {["rejected", "suspended"].includes(v.status) && (
            <p className="flex items-start gap-3 text-[15px]">
              <XCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
              <span>{v.status === "rejected" ? "This registration was not approved." : "This registration is on hold."} {v.status_reason && <>Reason: {v.status_reason}</>}</span>
            </p>
          )}
          {!verified && (
            <p className="mt-4 flex items-center gap-2 text-[14px] text-ink-muted"><Lock aria-hidden className="size-4" /> Your certificate unlocks when you&apos;re verified.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* The volunteer ID card, printable on its own. */}
        <section aria-labelledby="id-card-title" className="space-y-3">
          <h2 id="id-card-title" className="h-section">Your volunteer ID card</h2>
          <div id="id-card" className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_12px_32px_-16px_rgb(6_63_32/0.45)]">
            <div className="flex items-center gap-3 bg-brand-800 px-4 py-3 text-white">
              <span className="rounded-md bg-white p-0.5"><Logo size={30} /></span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[12px] font-semibold uppercase tracking-[0.14em] text-white/80">African Democratic Congress</span>
                <span className="block text-[15px] font-bold">Volunteer ID</span>
              </span>
            </div>
            <div aria-hidden className="h-1 bg-accent-500" />
            <div className="flex gap-4 p-4">
              <div className="min-w-0 flex-1 space-y-2.5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Name</p>
                  <p className="break-words text-[17px] font-bold leading-tight">{name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Volunteer ID</p>
                  <p className="font-mono text-[15px] font-bold">{v.public_id}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Volunteering as</p>
                  <p className="text-[13px] font-semibold leading-snug">{roles.map((r) => labelOf(VOLUNTEER_ROLES, r)).join(" · ")}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Ward</p>
                  <p className="text-[13px] leading-snug">{place}</p>
                </div>
              </div>
              <div className="flex w-24 shrink-0 flex-col items-center gap-1.5">
                <div className="size-24 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
                <span className="text-[10px] text-ink-muted">Scan to verify</span>
              </div>
            </div>
            <div className={cx("flex items-center justify-between px-4 py-2 text-[12px] font-semibold", verified ? "bg-success-bg text-success" : "bg-surface-alt text-ink-muted")}>
              <span>{verified ? "Verified volunteer" : "Pending verification"}</span>
              <span>{verified ? `Since ${dateLabel(v.verified_at)}` : `Registered ${dateLabel(v.created_at)}`}</span>
            </div>
          </div>
          <PrintCard />
        </section>

        <Card className="h-fit p-5 sm:p-6">
          <h2 className="h-section">Your details</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {[
              ["Volunteering as", roles.map((r) => labelOf(VOLUNTEER_ROLES, r)).join(", ")],
              ["Phone", formatPhone(open(v.phone_enc))],
              ["Email", email || "Not given"],
              ["Polling unit", pu?.name ?? "Not chosen yet"],
              ["Languages", languages.map((l) => labelOf(LANGUAGES, l)).join(", ") || "—"],
              ["Usually free", labelOf(AVAILABILITY, v.availability) || "—"],
              ["Best way to reach you", labelOf(CONTACT_CHANNELS, v.preferred_channel) || "—"],
              ["PVC", labelOf(PVC_STATUS, v.pvc_status)],
            ].map(([k, val]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[13px] font-semibold text-ink-muted">{k}</dt>
                <dd className="mt-0.5 break-words text-[15px]">{val}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 space-y-2 border-t border-line pt-4">
            <p className="text-[14px] text-ink-muted">Need to change something? Tell your ward coordinator when they call.</p>
            <ChangePassword />
          </div>
        </Card>
      </div>
    </div>
  );
}

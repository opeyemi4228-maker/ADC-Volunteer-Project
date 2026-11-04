import Link from "next/link";
import QRCode from "qrcode";
import {
  Check, Clock, CircleHelp, XCircle, Download, ShieldCheck, Lock, CalendarDays, HandHeart, IdCard, Award,
  Phone, Mail, MapPin, Languages, CalendarClock, MessageCircle, BadgeCheck, ExternalLink, PhoneCall,
} from "lucide-react";

import { all, one } from "@/lib/db";
import { open } from "@/lib/crypto";
import { placeLabel, puOf } from "@/lib/geo";
import { formatPhone } from "@/lib/validate";
import { certificateNumber } from "@/lib/certificate";
import { VOLUNTEER_ROLES, LANGUAGES, AVAILABILITY, CONTACT_CHANNELS, PVC_STATUS, labelOf } from "@/lib/options";
import { Logo, StatusBadge, dateLabel, cx, fmt } from "@/components/ui";
import { Panel, StatCard } from "@/components/workspace/charts/Dash";
import { volunteerContext, portalSummary } from "@/lib/volunteer-portal";
import PrintCard from "./PrintCard";
import CopyLink from "./CopyLink";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

const STATE = {
  verified: { label: "Verified", icon: BadgeCheck, tone: "success" },
  pending: { label: "Under review", icon: Clock, tone: "warning" },
  info_requested: { label: "Info needed", icon: CircleHelp, tone: "info" },
  rejected: { label: "Not approved", icon: XCircle, tone: "danger" },
  suspended: { label: "On hold", icon: XCircle, tone: "danger" },
};

/**
 * The dashboard a volunteer sees after signing in with their phone number (or
 * email) and password. It answers, in order: am I verified yet, where is my
 * volunteer ID card, where is my certificate, and what did I sign up for.
 */
export default async function VolunteerHome({ viewer, volunteerId }) {
  const v = await one("SELECT * FROM volunteers WHERE id = :id", { id: volunteerId });
  if (!v) return <p>Volunteer record not found.</p>;
  const account = await one("SELECT email_enc FROM users WHERE id = :id", { id: viewer.id });
  const email = open(account?.email_enc) || open(v.email_enc);
  const roles = (await all("SELECT role FROM volunteer_roles WHERE volunteer_id = :v", { v: v.id })).map((r) => r.role);
  const languages = (await all("SELECT language FROM volunteer_languages WHERE volunteer_id = :v", { v: v.id })).map((r) => r.language);
  const name = [v.first_name, v.middle_name, v.surname].filter(Boolean).join(" ");
  const place = placeLabel({ state_code: v.vote_state_code, lga_code: v.vote_lga_code, ward_code: v.vote_ward_code });
  const pu = v.vote_pu_code ? puOf(v.vote_pu_code) : null;
  const verified = v.status === "verified";
  const reviewing = ["pending", "info_requested"].includes(v.status);
  const verifyUrl = `${SITE}/verify/${v.public_id}`;
  const qr = await QRCode.toString(verifyUrl, { type: "svg", margin: 0, color: { dark: "#063f20", light: "#ffffff" } });
  const state = STATE[v.status] ?? { label: v.status, icon: CircleHelp, tone: "brand" };
  const days = Math.max(0, Math.floor((Date.now() - new Date(String(v.created_at).replace(" ", "T")).getTime()) / 86400000));
  const roleNames = roles.map((r) => labelOf(VOLUNTEER_ROLES, r));
  const work = await portalSummary(await volunteerContext(v.id));

  const steps = [
    { label: "Registered", done: true, when: dateLabel(v.created_at) },
    {
      label: v.status === "info_requested" ? "More information needed" : "Coordinator review",
      done: verified,
      current: reviewing,
      when: verified ? "Details confirmed" : reviewing ? "Usually within 7 days" : v.status === "rejected" ? "Not approved" : "On hold",
    },
    { label: "Verified", done: verified, when: verified ? `${dateLabel(v.verified_at)} · certificate issued` : "Certificate unlocks here" },
  ];

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-[20px] font-bold text-white shadow-[0_8px_20px_-10px_rgb(10_115_56/0.8)]" aria-hidden>
          {v.first_name[0]}{v.surname[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold uppercase tracking-wider text-brand-700">My volunteer dashboard</p>
          <h1 className="h-page break-words">Welcome back, {v.first_name}</h1>
          <p className="mt-0.5 text-[14px] text-ink-muted"><span className="font-mono font-semibold text-ink">{v.public_id}</span> · {place}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <a href="#id-card-title" className="btn btn-secondary btn-sm"><IdCard aria-hidden className="size-4" /> My ID card</a>
          {verified && (
            <a href={`/api/v1/volunteers/${v.id}/certificate`} className="btn btn-primary btn-sm shadow-[0_6px_16px_-8px_rgb(10_115_56/0.7)]"><Download aria-hidden className="size-4" /> Certificate</a>
          )}
        </div>
      </header>

      <section aria-label="Your record at a glance" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Status"
          icon={state.icon}
          tone={state.tone}
          value={state.label}
          valueClassName="text-[19px] leading-7 sm:text-[24px] sm:leading-9"
          sub={verified ? `Verified on ${dateLabel(v.verified_at)}` : reviewing ? "A coordinator will call you to confirm" : v.status_reason || "Contact your ward coordinator"}
        />
        <StatCard
          label="Member for"
          icon={CalendarDays}
          value={days === 0 ? "Today" : `${fmt(days)} ${days === 1 ? "day" : "days"}`}
          valueClassName="text-[19px] leading-7 sm:text-[24px] sm:leading-9"
          sub={`Registered ${dateLabel(v.created_at)}`}
        />
        <StatCard
          label="Roles"
          icon={HandHeart}
          tone="accent"
          value={fmt(roles.length)}
          valueClassName="text-[19px] leading-7 sm:text-[24px] sm:leading-9"
          sub={roleNames.join(" · ") || "None chosen yet"}
        />
        <StatCard
          label="PVC"
          icon={IdCard}
          tone="info"
          value={v.pvc_status === "yes" ? "Collected" : v.pvc_status === "not_collected" ? "To collect" : "Not registered"}
          valueClassName="text-[19px] leading-7 sm:text-[24px] sm:leading-9"
          sub={v.pvc_status === "yes" ? "You're ready to vote" : "You need a PVC to vote on election day"}
        />
      </section>

      {/* The work: tasks set for their area, what they reported, their photos and messages. */}
      <section aria-labelledby="my-work" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="my-work" className="text-[17px] font-bold tracking-tight">My volunteer work</h2>
          {verified && <a href="/workspace/my/activities/new" className="btn btn-primary btn-sm"><CalendarClock aria-hidden className="size-4" /> Report an activity</a>}
        </div>
        {work.nextTask && verified && (
          <a href="/workspace/my/tasks" className="card flex flex-wrap items-center gap-3 border-brand-200 bg-brand-50/60 p-4 hover:border-brand-600">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-700 text-white"><Check aria-hidden className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-brand-800">{work.todo ? `${fmt(work.todo)} ${work.todo === 1 ? "task is" : "tasks are"} waiting for your report` : "Your next task"}</span>
              <span className="block truncate text-[15px] font-bold">{work.nextTask.title}</span>
              <span className="block text-[13px] text-ink-muted">{work.nextTask.areaName}{work.nextTask.due_date ? ` · due ${dateLabel(work.nextTask.due_date)}` : ""}</span>
            </span>
            <span className="text-[14px] font-semibold text-brand-700">Open my tasks</span>
          </a>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label="Tasks" icon={Check} href="/workspace/my/tasks" value={fmt(work.openTasks)} valueClassName="text-[24px] leading-9"
            sub={work.tasks ? `${fmt(work.openTasks)} open for your area · you've sent ${fmt(work.reports)} ${work.reports === 1 ? "report" : "reports"}` : "None set for your area yet"} />
          <StatCard label="Activities" icon={CalendarClock} tone="accent" href="/workspace/my/activities" value={fmt(work.activities)} valueClassName="text-[24px] leading-9"
            sub={verified ? "Meetings, door-to-door and rallies you reported" : "You can report once you're verified"} />
          <StatCard label="Photos and videos" icon={Award} tone="info" href="/workspace/my/media" value={fmt(work.media)} valueClassName="text-[24px] leading-9"
            sub={work.media ? `${fmt(work.mediaApproved)} accepted · ${fmt(work.mediaPending)} waiting for review` : "Add them to your reports"} />
          <StatCard label="Messages" icon={MessageCircle} tone="success" href="/workspace/my/messages" value={fmt(work.messages)} valueClassName="text-[24px] leading-9"
            sub={work.lastMessage ? `Latest ${dateLabel(work.lastMessage)}` : "Announcements will appear here"} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {/* Verification and certificate: the reason most people sign in. */}
          <div id="certificate" className="scroll-mt-24">
          <Panel
            id="certificate-title"
            title="Verification and certificate"
            sub="Where your registration stands."
            action={<StatusBadge status={v.status} />}
          >
            <ol className="flex flex-col sm:flex-row" aria-label="Registration progress">
              {steps.map((st, i) => {
                const next = steps[i + 1];
                return (
                  <li key={st.label} className="relative flex flex-1 gap-3 pb-5 last:pb-0 sm:flex-col sm:gap-3 sm:pb-0 sm:pr-4">
                    {next && (
                      <span
                        aria-hidden
                        className={cx(
                          "absolute rounded-full max-sm:bottom-1 max-sm:left-[15px] max-sm:top-10 max-sm:w-0.5 sm:left-11 sm:right-2 sm:top-[15px] sm:h-0.5",
                          next.done ? "bg-brand-600" : next.current ? "bg-gradient-to-r from-brand-600 to-brand-200 max-sm:bg-gradient-to-b" : "bg-line",
                        )}
                      />
                    )}
                    <span className={cx("relative grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold", st.done ? "bg-brand-700 text-white" : st.current ? "bg-white text-brand-800 ring-2 ring-brand-600 ring-offset-2" : "bg-surface-alt text-ink-muted ring-1 ring-line")}>
                      {st.done ? <Check aria-hidden className="size-4" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="min-w-0 pt-1 sm:pt-0">
                      <span className={cx("block text-[14px] font-semibold leading-5", !st.done && !st.current && "text-ink-muted")}>{st.label}</span>
                      {st.when && <span className="mt-0.5 block text-[12px] leading-4 text-ink-muted">{st.when}</span>}
                      <span className="sr-only">{st.done ? "(done)" : st.current ? "(in progress)" : "(not yet)"}</span>
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 border-t border-line pt-6">
              {verified && (
                <div className="grid items-center gap-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
                  {/* A small picture of the certificate, so it is recognisable before it is downloaded. */}
                  <a href={`/api/v1/volunteers/${v.id}/certificate`} className="group relative block" aria-label="Download your certificate (PDF)">
                    <div className="relative aspect-[1.414] overflow-hidden rounded-lg border border-[#e8e2cf] bg-[#fffdf6] p-2 shadow-[0_10px_24px_-14px_rgb(6_63_32/0.55)] transition-transform group-hover:-translate-y-0.5">
                      <div className="flex h-full flex-col items-center justify-center rounded border border-brand-200 px-3 text-center outline outline-1 outline-offset-2 outline-brand-100">
                        <Logo size={18} />
                        <p className="mt-1.5 text-[6.5px] font-bold uppercase tracking-[0.18em] text-brand-800">Certificate of Volunteering</p>
                        <p className="mt-1 line-clamp-1 font-serif text-[12px] font-bold leading-4 text-ink">{name}</p>
                        <span aria-hidden className="mt-1 h-px w-16 bg-brand-200" />
                        <p className="mt-1 font-mono text-[6px] text-ink-muted">{certificateNumber(v)}</p>
                      </div>
                      <span aria-hidden className="absolute bottom-2.5 right-2.5 grid size-6 place-items-center rounded-full bg-accent-500 text-white ring-2 ring-[#fffdf6]"><Award className="size-3" /></span>
                    </div>
                  </a>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[16px] font-bold leading-6"><ShieldCheck aria-hidden className="size-5 shrink-0 text-success" /> Your certificate is ready</p>
                    <p className="mt-1 text-[13px] leading-5 text-ink-muted">You&apos;re a verified ADC volunteer. Download it, print it or share it; anyone can check it&apos;s genuine by scanning its QR code.</p>
                    <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-[13px]">
                      <div className="min-w-0 bg-white px-3 py-2.5">
                        <dt className="text-[11px] font-medium text-ink-muted">Certificate No.</dt>
                        <dd className="mt-0.5 truncate font-mono font-semibold" title={certificateNumber(v)}>{certificateNumber(v)}</dd>
                      </div>
                      <div className="min-w-0 bg-white px-3 py-2.5">
                        <dt className="text-[11px] font-medium text-ink-muted">Issued</dt>
                        <dd className="mt-0.5 font-semibold">{dateLabel(v.verified_at)}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={`/api/v1/volunteers/${v.id}/certificate`} className="btn btn-primary btn-sm max-sm:flex-1"><Download aria-hidden className="size-4" /> Download PDF</a>
                      <CopyLink url={verifyUrl} label="Copy verification link" className="btn btn-secondary btn-sm max-sm:flex-1" />
                    </div>
                  </div>
                </div>
              )}
              {v.status === "pending" && (
                <p className="flex items-start gap-3 rounded-2xl bg-warning-bg p-4 text-[14px] leading-6">
                  <Clock aria-hidden className="mt-1 size-5 shrink-0 text-warning" />
                  <span>A coordinator in your ward will call you to confirm your details, usually within 7 days. {email ? <>We&apos;ll email <strong className="break-all">{email}</strong> and</> : "We'll"} send you an SMS as soon as you&apos;re verified, and your certificate will appear here.</span>
                </p>
              )}
              {v.status === "info_requested" && (
                <div className="flex items-start gap-3 rounded-2xl bg-info-bg p-4 text-[14px] leading-6">
                  <CircleHelp aria-hidden className="mt-1 size-5 shrink-0 text-info" />
                  <div>
                    <p className="font-semibold">Your coordinator needs a little more information.</p>
                    {v.status_reason && <p className="mt-1">&ldquo;{v.status_reason}&rdquo;</p>}
                    <p className="mt-1 text-ink-muted">Watch for their SMS or call, or contact your ward coordinator.</p>
                  </div>
                </div>
              )}
              {["rejected", "suspended"].includes(v.status) && (
                <p className="flex items-start gap-3 rounded-2xl bg-danger-bg p-4 text-[14px] leading-6">
                  <XCircle aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
                  <span>{v.status === "rejected" ? "This registration was not approved." : "This registration is on hold."} {v.status_reason && <>Reason: {v.status_reason}</>}</span>
                </p>
              )}
              {!verified && (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-muted"><Lock aria-hidden className="size-4" /> Your certificate unlocks when you&apos;re verified.</p>
              )}
            </div>
          </Panel>
          </div>

          <Panel title="Your details" sub="What you told us when you registered.">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                [HandHeart, "Volunteering as", roleNames.join(", ") || "—"],
                [Phone, "Phone", formatPhone(open(v.phone_enc))],
                [Mail, "Email", email || "Not given"],
                [MapPin, "Polling unit", pu?.name ?? "Not chosen yet"],
                [Languages, "Languages", languages.map((l) => labelOf(LANGUAGES, l)).join(", ") || "—"],
                [CalendarClock, "Usually free", labelOf(AVAILABILITY, v.availability) || "—"],
                [MessageCircle, "Best way to reach you", labelOf(CONTACT_CHANNELS, v.preferred_channel) || "—"],
                [IdCard, "PVC", labelOf(PVC_STATUS, v.pvc_status) || "—"],
              ].map(([Icon, k, val]) => (
                <div key={k} className="flex min-w-0 items-start gap-3 rounded-xl border border-line p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-alt text-ink-muted"><Icon aria-hidden className="size-4" /></span>
                  <div className="min-w-0">
                    <dt className="text-[12px] font-medium text-ink-muted">{k}</dt>
                    <dd className="mt-0.5 break-words text-[14px] font-semibold leading-5">{val}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="mt-5 space-y-2 border-t border-line pt-4">
              <p className="text-[13px] text-ink-muted">Need to change something? Tell your ward coordinator when they call.</p>
              <p className="text-[13px] text-ink-muted">You sign in with a one-time code sent to your registered phone number. There's no password to remember.</p>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {/* The volunteer ID card, printable on its own. */}
          <section aria-labelledby="id-card-title" className="card scroll-mt-24 p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="id-card-title" className="scroll-mt-24 text-[15px] font-bold tracking-tight">Your volunteer ID card</h2>
              <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", verified ? "bg-success-bg text-success" : "bg-surface-alt text-ink-muted")}>{verified ? "Active" : "Pending"}</span>
            </div>
            <div id="id-card" className="mx-auto max-w-[380px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_36px_-18px_rgb(6_63_32/0.5)]">
              <div className="flex items-center gap-3 bg-brand-800 px-4 py-3 text-white">
                <span className="rounded-md bg-white p-0.5"><Logo size={30} /></span>
                <span className="min-w-0 leading-tight">
                  <span className="block whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80">African Democratic Congress</span>
                  <span className="block text-[15px] font-bold">Volunteer ID</span>
                </span>
              </div>
              <div aria-hidden className="h-1 bg-accent-500" />
              <div className="flex gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Name</p>
                    <p className="break-words text-[16px] font-bold leading-tight">{name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Volunteer ID</p>
                    <p className="font-mono text-[14px] font-bold">{v.public_id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Volunteering as</p>
                    <p className="text-[12px] font-semibold leading-snug">{roleNames.join(" · ")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Ward</p>
                    <p className="text-[12px] leading-snug">{place}</p>
                  </div>
                </div>
                <div className="flex w-24 shrink-0 flex-col items-center gap-1.5">
                  <div className="size-24 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
                  <span className="text-[10px] text-ink-muted">Scan to verify</span>
                </div>
              </div>
              <div className={cx("flex items-center justify-between px-4 py-2 text-[11px] font-semibold", verified ? "bg-success-bg text-success" : "bg-surface-alt text-ink-muted")}>
                <span>{verified ? "Verified volunteer" : "Pending verification"}</span>
                <span>{verified ? `Since ${dateLabel(v.verified_at)}` : `Registered ${dateLabel(v.created_at)}`}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <PrintCard className="btn btn-secondary btn-sm w-full" />
              <Link href={`/verify/${v.public_id}`} className="inline-flex min-h-10 items-center justify-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline">
                <ExternalLink aria-hidden className="size-3.5" /> See your public verification page
              </Link>
            </div>
          </section>

          <Panel title="What happens next">
            <ol className="space-y-3.5">
              {(verified
                ? [
                    [ShieldCheck, "Keep your ID card handy", "Print it or keep this page on your phone. Coordinators may ask to see it."],
                    [PhoneCall, "Answer your coordinator", "They'll reach you on your preferred channel about tasks and training."],
                    [IdCard, v.pvc_status === "yes" ? "You're ready to vote" : "Collect your PVC", v.pvc_status === "yes" ? "Bring your PVC on election day." : "You need it to vote. Ask your coordinator where to collect it."],
                  ]
                : [
                    [PhoneCall, "Expect a call", "A coordinator in your ward will call to confirm your details."],
                    [MessageCircle, "Watch for an SMS", "We'll text you the moment you're verified."],
                    [Award, "Get your certificate", "It appears on this page as soon as you're verified."],
                  ]
              ).map(([Icon, title, text]) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon aria-hidden className="size-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold leading-5">{title}</span>
                    <span className="block text-[12px] leading-[18px] text-ink-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Phone, MapPin, ListChecks, Vote, ClipboardCheck, Megaphone, DoorOpen, Smartphone, Truck,
  CalendarDays, Scale, Stethoscope, Laptop, ShieldCheck, HandCoins,
} from "lucide-react";

import { getT } from "@/lib/i18n/server";
import { all, scalar } from "@/lib/db";
import { publicMomentum } from "@/lib/queries";
import { fmt } from "@/components/ui";
import { VOLUNTEER_ROLES } from "@/lib/options";
import DotMap from "@/components/site/DotMap";
import AreaFinder from "./AreaFinder";

// Live counts, map and momentum come from the database on every request.
export const dynamic = "force-dynamic";

const FAQ = [
  ["Is it free?", "Yes. Registering, and every message we send you, is free."],
  ["How does my group get its certificate?", "Register the group and create its login. Once a coordinator approves it, we email you and the certificate is ready to download from your group dashboard."],
  ["What can I volunteer for?", "Anything from polling unit agent to social media, driving or first aid. Choose as many as you like when you register; you can change them later."],
  ["Who sees my details?", "Only ADC coordinators for your own ward, LGA and state, and only what their role needs. Your phone number is encrypted when stored. We never sell data."],
  ["I don't know my polling unit.", "It's printed on your voter's card (PVC). If you don't have it to hand, tick \"I don't know my polling unit\" and your ward coordinator will help."],
  ["Can I register without data or a smartphone?", "Yes. Dial the USSD code on any phone, or ask your ward coordinator or a field agent to register you."],
];

function data() {
  const byState = all("SELECT vote_state_code AS code, COUNT(*) AS n FROM volunteers WHERE status = 'verified' GROUP BY vote_state_code");
  return {
    volunteers: scalar("SELECT COUNT(*) FROM volunteers WHERE status = 'verified'"),
    byState: Object.fromEntries(byState.map((r) => [r.code, r.n])),
    momentum: publicMomentum(),
  };
}

export default async function HomePage() {
  const t = await getT();
  const d = data();
  const ussd = process.env.NEXT_PUBLIC_USSD_CODE ?? "*XXX*YY#";
  const statesActive = Object.keys(d.byState).length;

  return (
    <>
      {/* ── Hero: an inset panel, the live map as the one visual idea ─────── */}
      <section className="px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="relative overflow-hidden rounded-[28px] bg-brand-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_40%,rgb(18_166_80/0.22),transparent_70%)]" aria-hidden />
          <div className="container-page relative grid items-center gap-6 pb-10 pt-12 sm:pb-14 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:py-20">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] py-1.5 pl-2.5 pr-3.5 text-[13px] font-medium text-white/85">
                <span className="relative flex size-2">
                  <span className="live-dot absolute inset-0 rounded-full bg-brand-300" />
                  <span className="relative size-2 rounded-full bg-brand-300" />
                </span>
                {t("{n} verified volunteers in {s} states", { n: fmt(d.volunteers), s: statesActive })}
              </p>
              <h1 className="mt-6 text-[2.5rem] font-bold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[3.5rem] lg:text-[4rem]">
                {t("Nigeria is organising, ward by ward.")}
              </h1>
              <p className="mt-6 max-w-[34rem] text-[17px] leading-[1.65] text-white/75 sm:text-[18px]">
                {t("Join as a volunteer and you'll be linked to your ward and polling unit, so the coordinators nearest you can reach you.")}
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
                <Link href="/volunteer" className="btn btn-lg bg-accent-500 text-ink hover:bg-[#ff8a3d]">
                  {t("Join as a volunteer")}
                  <ArrowRight aria-hidden className="size-5" />
                </Link>
                <Link href="/register" className="text-[16px] font-semibold text-white underline decoration-white/35 underline-offset-[6px] hover:decoration-white">
                  {t("Register a support group")}
                </Link>
              </div>
              <p className="mt-8 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px] text-white/55">
                <span>{t("Free")}</span>
                <span>{t("About 3 minutes")}</span>
                <span>{t("Works on any phone")}</span>
              </p>
            </div>

            <figure className="relative -mx-2 sm:mx-0">
              <DotMap
                byState={d.byState}
                recentByState={d.momentum.recentByState}
                label={t("Map of Nigeria: states light up by verified volunteers; pulses mark the most sign-ups this week")}
                className="h-auto w-full"
              />
              <figcaption className="mt-2 flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-[12px] text-white/55">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-10 rounded-full bg-gradient-to-r from-brand-400 to-brand-100" aria-hidden />
                  {t("Verified volunteers")}
                </span>
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-accent-500" aria-hidden />
                  {t("Most sign-ups this week")}
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── This week: aggregate, privacy-safe momentum ───────────────────── */}
      {d.momentum.lgas.length > 0 && (
        <section className="container-page reveal pt-16 sm:pt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{t("This week")}</h2>
            <p className="text-[14px] text-ink-muted">{t("{n} new verified volunteers across Nigeria", { n: fmt(d.momentum.thisWeek) })}</p>
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
            {d.momentum.lgas.map((l) => (
              <li key={l.lga} className="bg-white p-5 max-sm:nth-[n+5]:hidden">
                <p className="num text-[28px] font-bold leading-none tracking-tight text-brand-800">+{fmt(l.recent)}</p>
                <p className="mt-3 text-[14px] font-semibold leading-snug">{l.lgaName}</p>
                <p className="text-[13px] text-ink-muted">{l.state === "FCT" ? "FCT" : l.stateName}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Why register: three plain promises (Labour's "plan" cards) ─────── */}
      <section className="container-page reveal pt-24 sm:pt-32">
        <h2 className="max-w-2xl text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[2.75rem]">{t("Why register with the ADC")}</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <Promise icon={MapPin} title={t("Linked to your ward")}>
            {t("You're connected to the coordinators for your ward and polling unit, so they can reach you with real work to do.")}
          </Promise>
          <Promise icon={ListChecks} title={t("You choose how you help")}>
            {t("Pick what suits you, from polling unit agent to social media. A few quick questions and you're in.")}
          </Promise>
          <Promise icon={Phone} title={t("Works on any phone")}>
            {t("No smartphone or data? Dial")} <strong className="font-semibold text-ink">{ussd}</strong> {t("on any network, or ask your ward coordinator.")}
          </Promise>
        </div>
      </section>

      {/* ── Callout: one bold statement and one thing to do (Labour's red card, in ADC green) ── */}
      <section className="container-page reveal pt-24 sm:pt-32">
        <div className="grid gap-10 rounded-[28px] bg-brand-700 p-7 text-white sm:p-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:p-16">
          <div className="self-center">
            <h2 className="text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[2.75rem]">{t("See who's organising where you live.")}</h2>
            <p className="mt-5 max-w-md text-[18px] leading-[1.6] text-white/85">{t("See how many verified volunteers and support groups are already active, across Nigeria or right down to your ward.")}</p>
          </div>
          <div className="rounded-2xl bg-white p-6 text-ink shadow-[0_24px_48px_-24px_rgb(0_0_0/0.45)] sm:p-8">
            <AreaFinder />
          </div>
        </div>
      </section>

      {/* ── Ways to help: every role, one tap to volunteer for it ───────────── */}
      <section id="ways-to-help" className="container-page reveal scroll-mt-24 pt-24 sm:pt-32">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[2.75rem]">{t("What would you like to volunteer for?")}</h2>
            <p className="mt-4 text-[18px] leading-[1.6] text-ink-muted">{t("Choose one to start. You can add more when you register.")}</p>
          </div>
          <p className="text-[15px] text-ink-muted">
            <span className="num text-[28px] font-bold tracking-tight text-brand-800">{fmt(d.volunteers)}</span> {t("verified volunteers so far, in {s} states", { s: statesActive })}
          </p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VOLUNTEER_ROLES.map((r) => {
            const Icon = ROLE_ICONS[r.value] ?? ListChecks;
            return (
              <li key={r.value}>
                <Link
                  href={`/volunteer?role=${r.value}`}
                  className="group flex h-full flex-col rounded-3xl bg-white p-6 ring-1 ring-line transition-shadow hover:shadow-[0_14px_34px_-18px_rgb(6_63_32/0.35)] hover:ring-brand-200"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white">
                    <Icon aria-hidden className="size-6" strokeWidth={2} />
                  </span>
                  <h3 className="mt-5 text-[1.25rem] font-bold leading-tight tracking-[-0.02em]">{t(r.label)}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-[1.6] text-ink-muted">{t(r.hint)}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-700">
                    {t("Volunteer for this")}
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Support groups: register, get a dashboard and a certificate ─────── */}
      <section id="support-groups" className="container-page reveal scroll-mt-24 pt-24 sm:pt-32">
        <div className="grid items-center gap-10 overflow-hidden rounded-[28px] bg-white p-7 ring-1 ring-line sm:p-12 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:p-14">
          <div>
            <p className="text-[15px] font-semibold text-brand-700">{t("For group leaders")}</p>
            <h2 className="mt-3 text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[2.75rem]">{t("Register your support group")}</h2>
            <p className="mt-5 max-w-lg text-[17px] leading-[1.65] text-ink-muted">
              {t("A few quick questions and your group is on the map. You get a group ID, an invite code for your members, a dashboard to post your work, and a certificate once you're approved.")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/register" className="btn btn-primary btn-lg">
                {t("Register a group")}
                <ArrowRight aria-hidden className="size-5" />
              </Link>
              <Link href="/login" className="text-[16px] font-semibold text-brand-700 underline decoration-brand-700/30 underline-offset-[6px] hover:decoration-brand-700">
                {t("Group login")}
              </Link>
            </div>
          </div>
          <div className="grid place-items-center rounded-3xl bg-paper-deep p-6 sm:p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/certificate-sample.jpg"
              alt={t("Sample certificate of registration for a support group")}
              width={1600}
              height={1131}
              loading="lazy"
              className="w-full max-w-md rotate-[-2deg] rounded-md shadow-[0_18px_40px_-18px_rgb(6_63_32/0.45)]"
            />
          </div>
        </div>
      </section>

      {/* ── Questions ─────────────────────────────────────────────────────── */}
      <section className="container-page reveal pt-24 sm:pt-32">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div>
            <h2 className="text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[2.75rem]">{t("Questions")}</h2>
            <Link href="/help" className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-700 hover:text-brand-900">
              {t("All help topics")}
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-semibold tracking-tight">
                  {t(q)}
                  <span className="relative size-4 shrink-0 text-ink-muted" aria-hidden>
                    <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
                    <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-current transition-transform duration-200 group-open:rotate-90 group-open:opacity-0" />
                  </span>
                </summary>
                <p className="-mt-1 max-w-[60ch] pb-6 text-[16px] leading-[1.7] text-ink-muted">{t(a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close ─────────────────────────────────────────────────────────── */}
      <section className="container-page reveal pb-4 pt-24 sm:pt-32">
        <div className="flex flex-col items-start justify-between gap-8 border-t border-line pt-12 md:flex-row md:items-end">
          <h2 className="max-w-2xl text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[2.75rem]">
            {t("Your polling unit needs you.")}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/volunteer" className="btn btn-primary btn-lg shrink-0">
              {t("Join as a volunteer")}
              <ArrowRight aria-hidden className="size-5" />
            </Link>
            <Link href="/register" className="btn btn-secondary btn-lg shrink-0">
              {t("Register a group")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** One promise: icon, bold title, one sentence. */
function Promise({ icon: Icon, title, children }) {
  return (
    <div className="rounded-3xl bg-white p-7 ring-1 ring-line sm:p-8">
      <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Icon aria-hidden className="size-6" strokeWidth={2} />
      </span>
      <h3 className="mt-6 text-[1.375rem] font-bold leading-tight tracking-[-0.02em]">{title}</h3>
      <p className="mt-3 text-[16px] leading-[1.65] text-ink-muted">{children}</p>
    </div>
  );
}

const ROLE_ICONS = {
  pu_agent: Vote,
  ward_collation: ClipboardCheck,
  mobiliser: Megaphone,
  canvasser: DoorOpen,
  social_media: Smartphone,
  logistics: Truck,
  events: CalendarDays,
  legal: Scale,
  medical: Stethoscope,
  data_it: Laptop,
  security_liaison: ShieldCheck,
  fundraising: HandCoins,
};

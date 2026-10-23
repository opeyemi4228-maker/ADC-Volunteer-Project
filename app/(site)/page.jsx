import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Phone, MapPin, ListChecks, Vote, ClipboardCheck, Megaphone, DoorOpen, Smartphone, Truck,
  CalendarDays, Scale, Stethoscope, Laptop, ShieldCheck, HandCoins, Check, BadgeCheck,
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
  ["What can I volunteer for?", "Anything from polling unit agent to social media, driving or first aid. Choose up to three when you register, so your coordinator knows where you'll help most."],
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
  // Live figures only once they say something; "0 volunteers in 0 states" helps nobody.
  const showCount = d.volunteers >= 25;

  return (
    <>
      {/* ── Hero: an inset panel, the live map as the one visual idea ─────── */}
      <section className="page-inset overflow-x-clip">
        <div className="relative isolate overflow-hidden rounded-3xl bg-brand-950 text-white sm:rounded-[28px]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_40%,rgb(18_166_80/0.22),transparent_70%)]" aria-hidden />
          <div className="container-page relative grid min-w-0 items-center gap-8 py-9 max-sm:px-5 sm:gap-10 sm:py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 lg:py-16 xl:gap-12 xl:py-20">
            <div className="min-w-0 max-w-xl">
              <p className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-white/85 min-[360px]:text-[12.5px] sm:pr-3.5 sm:text-[13px]">
                <span className="relative flex size-2 shrink-0">
                  <span className="live-dot absolute inset-0 rounded-full bg-brand-300" />
                  <span className="relative size-2 rounded-full bg-brand-300" />
                </span>
                {showCount
                  ? t("{n} verified volunteers in {s} states", { n: fmt(d.volunteers), s: statesActive })
                  : t("Registration is open in all 36 states and the FCT")}
              </p>
              <h1 className="mt-5 text-[clamp(2rem,9.6vw,2.5rem)] font-bold leading-[1.06] tracking-[-0.035em] text-balance sm:mt-6 sm:text-[3.5rem] lg:text-[3.4rem] xl:text-[4.1rem]">
                {t("Nigeria is organising, ward by ward.")}
              </h1>
              <p className="mt-4 max-w-[34rem] text-pretty text-[16px] leading-[1.6] text-white/75 sm:mt-6 sm:text-[18px] sm:leading-[1.65] lg:mt-5 lg:text-[17px] xl:mt-6 xl:text-[18px]">
                {t("Join as a volunteer and you'll be linked to your ward and polling unit, so the coordinators nearest you can reach you.")}
              </p>
              <div className="mt-7 flex flex-col items-stretch gap-3 sm:mt-9 lg:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-7 sm:gap-y-4">
                <Link href="/volunteer" className="btn btn-lg w-full justify-center bg-accent-500 text-ink hover:bg-[#ff8a3d] sm:w-auto">
                  {t("Join as a volunteer")}
                  <ArrowRight aria-hidden className="size-5" />
                </Link>
                <Link href="/#ways-to-help" className="inline-flex min-h-11 items-center justify-center text-[16px] font-semibold text-white underline decoration-white/35 underline-offset-[6px] hover:decoration-white sm:justify-start">
                  {t("See the ways to help")}
                </Link>
              </div>
              <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[13px] text-white/65 sm:mt-7 sm:justify-start sm:gap-x-5 sm:text-[14px]">
                {[t("Free"), t("About 3 minutes"), t("Works on any phone")].map((x) => (
                  <li key={x} className="flex items-center gap-1.5 whitespace-nowrap">
                    <Check aria-hidden className="size-3.5 text-brand-300" strokeWidth={3} />
                    {x}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-center text-[14px] text-white/65 sm:mt-6 sm:border-t sm:border-white/10 sm:pt-5 sm:text-left">
                {t("Already registered?")}{" "}
                <Link href="/login" className="font-semibold text-white underline decoration-white/35 underline-offset-4 hover:decoration-white">
                  {t("Sign in for your ID card and certificate")}
                </Link>
              </p>
            </div>

            <figure className="relative mx-auto w-full min-w-0 max-w-[26rem] border-t border-white/10 pt-6 sm:max-w-[32rem] sm:border-0 sm:pt-0 lg:ml-auto lg:mr-0 lg:max-w-[36rem]">
              <DotMap
                byState={d.byState}
                recentByState={d.momentum.recentByState}
                label={t("Map of Nigeria: states light up by verified volunteers; pulses mark the most sign-ups this week")}
                className="h-auto w-full"
              />
              <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[12px] text-white/55 sm:mt-2 sm:justify-end">
                {!showCount ? (
                  <span>{t("Every state is open. Yours could light up first.")}</span>
                ) : (
                <>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-10 rounded-full bg-gradient-to-r from-brand-400 to-brand-100" aria-hidden />
                  {t("Verified volunteers")}
                </span>
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-accent-500" aria-hidden />
                  {t("Most sign-ups this week")}
                </span>
                </>
                )}
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

      {/* ── How it works: what happens after "Join", in three steps ─────────── */}
      <section className="container-page reveal pt-24 sm:pt-32">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="max-w-2xl text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[2.75rem]">{t("How it works")}</h2>
          <p className="max-w-sm text-[16px] leading-[1.6] text-ink-muted">{t("From sign-up to your first task, here is what to expect.")}</p>
        </div>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-3xl bg-line ring-1 ring-line md:grid-cols-3">
          {[
            [ClipboardCheck, t("Register in about 3 minutes"), t("Choose up to three ways to help, tell us where you vote, and create a password.")],
            [Phone, t("A coordinator confirms you"), t("Your ward coordinator calls to check your details, usually within 7 days. We let you know by SMS.")],
            [BadgeCheck, t("Get your ID card and certificate"), t("Sign in to download your volunteer ID card and certificate, and hear about tasks near you.")],
          ].map(([Icon, title, body], i) => (
            <li key={title} className="relative flex items-start gap-5 bg-white p-6 sm:p-8 md:flex-col md:gap-0">
              <span className="flex shrink-0 items-center gap-3 md:justify-between">
                <span className="grid size-12 place-items-center rounded-full bg-brand-700 text-white">
                  <Icon aria-hidden className="size-6" strokeWidth={2} />
                </span>
                <span className="num hidden text-[44px] font-bold leading-none tracking-tight text-line md:block" aria-hidden>0{i + 1}</span>
              </span>
              <span className="min-w-0 md:mt-6">
                <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-700">{t("Step {n}", { n: i + 1 })}</span>
                <span className="mt-1 block text-[1.25rem] font-bold leading-tight tracking-[-0.02em]">{title}</span>
                <span className="mt-2 block text-[15px] leading-[1.65] text-ink-muted">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

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
            <p className="mt-5 max-w-md text-[18px] leading-[1.6] text-white/85">{t("See how many verified volunteers are already active, across Nigeria or right down to your ward.")}</p>
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
            <p className="mt-4 text-[18px] leading-[1.6] text-ink-muted">{t("Pick one to start. You can choose up to three when you register.")}</p>
          </div>
          <p className="text-[15px] text-ink-muted">
            <span className="num text-[28px] font-bold tracking-tight text-brand-800">{fmt(d.volunteers)}</span> {t("verified volunteers so far, in {s} states", { s: statesActive })}
          </p>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {VOLUNTEER_ROLES.map((r) => {
            const Icon = ROLE_ICONS[r.value] ?? ListChecks;
            return (
              <li key={r.value}>
                <Link
                  href={`/volunteer?role=${r.value}`}
                  className="group flex h-full items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-18px_rgb(6_63_32/0.35)] hover:ring-brand-200 sm:items-start sm:rounded-3xl sm:p-6"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white sm:size-12">
                    <Icon aria-hidden className="size-5 sm:size-6" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-bold leading-tight tracking-[-0.01em] sm:text-[1.15rem]">{t(r.label)}</span>
                    <span className="mt-1 block text-[14px] leading-[1.5] text-ink-muted sm:mt-1.5 sm:text-[15px]">{t(r.hint)}</span>
                  </span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full text-brand-700 ring-1 ring-line transition-colors group-hover:bg-brand-700 group-hover:text-white group-hover:ring-brand-700" aria-hidden>
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="sr-only">{t("Volunteer for this")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Questions ─────────────────────────────────────────────────────── */}
      <section className="container-page reveal pt-24 sm:pt-32">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div>
            <h2 className="text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[2.75rem]">{t("Questions")}</h2>
            <Link href="/help" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-brand-700 hover:text-brand-900">
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
          <h2 className="min-w-0 max-w-2xl text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[2.75rem] md:flex-1">
            {t("Your polling unit needs you.")}
          </h2>
          <div className="flex shrink-0 flex-wrap gap-3 max-sm:w-full max-sm:[&>a]:w-full">
            <Link href="/volunteer" className="btn btn-primary btn-lg shrink-0">
              {t("Join as a volunteer")}
              <ArrowRight aria-hidden className="size-5" />
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

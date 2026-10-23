import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Phone, MapPin, ListChecks, Vote, ClipboardCheck, Megaphone, DoorOpen, Smartphone, Truck,
  CalendarDays, Scale, Stethoscope, Laptop, ShieldCheck, HandCoins, Check,
} from "lucide-react";

import { getT } from "@/lib/i18n/server";
import { all, scalar } from "@/lib/db";
import { publicMomentum, weeklyVerified } from "@/lib/queries";
import { fmt, cx } from "@/components/ui";
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
    weeks: weeklyVerified(8),
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
      {/* ── Hero: one photograph, the promise bottom-left, live figures bottom-right ── */}
      <section id="hero" className="relative -mt-[71px] px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative isolate flex min-h-[max(640px,calc(100svh-0.5rem))] flex-col overflow-hidden rounded-[22px] bg-brand-950 text-white sm:min-h-[680px] sm:rounded-[28px] lg:h-[calc(100svh-1.5rem)] lg:max-h-[900px] lg:min-h-[620px]">
          {/* Abuja, Nigerian flags at NNPC Towers (mirrored, cropped). Photo: Praise Godwin on Unsplash, Unsplash License. */}
          <picture className="absolute inset-0 -z-10">
            <source media="(max-width: 639px)" srcSet="/brand/hero-abuja-portrait.webp" />
            <source media="(max-width: 1279px)" srcSet="/brand/hero-abuja-1280.webp" />
            <img src="/brand/hero-abuja-2400.webp" alt="" fetchPriority="high" className="size-full object-cover object-[50%_0%] lg:object-[50%_30%]" />
          </picture>
          {/* Two quiet washes keep every word readable without hiding the flags. */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(3_22_12/0.5)_0%,rgb(3_22_12/0)_24%,rgb(3_22_12/0.15)_50%,rgb(3_22_12/0.9)_100%)]" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(3_22_12/0.62)_0%,rgb(3_22_12/0.18)_42%,transparent_62%)]" />

          <div className="container-page mt-auto grid items-end gap-8 pb-7 pt-28 max-sm:px-4 sm:pb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12 lg:pb-14">
            <div className="min-w-0 max-w-[44rem]">
              <p className="inline-flex max-w-full items-center gap-2.5 rounded-full bg-black/30 py-1.5 pl-2.5 pr-3.5 text-[12.5px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-md sm:text-[13px]">
                <span className="relative flex size-2 shrink-0">
                  <span className="live-dot absolute inset-0 rounded-full bg-brand-300" />
                  <span className="relative size-2 rounded-full bg-brand-300" />
                </span>
                {showCount
                  ? t("{n} verified volunteers in {s} states", { n: fmt(d.volunteers), s: statesActive })
                  : t("Registration is open in all 36 states and the FCT")}
              </p>
              <h1 className="mt-5 text-[clamp(2.4rem,8.5vw,3rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-balance sm:text-[3.75rem] lg:text-[clamp(3.75rem,5.4vw,5.25rem)]">
                {t("Nigeria is organising, ward by ward.")}
              </h1>
              <p className="mt-4 max-w-[36rem] text-pretty text-[16px] leading-[1.6] text-white/80 sm:mt-5 sm:text-[18px]">
                {t("Join as a volunteer and you'll be linked to your ward and polling unit, so the coordinators nearest you can reach you.")}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                <Link href="/volunteer" className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-accent-500 pl-6 pr-5 text-[16px] font-semibold text-ink shadow-[0_12px_30px_-12px_rgb(244_115_33/0.8)] transition-colors hover:bg-[#ff8a3d]">
                  {t("Join as a volunteer")}
                  <ArrowRight aria-hidden className="size-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
                <Link href="/#ways-to-help" className="inline-flex h-13 items-center justify-center rounded-full px-5 text-[16px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm transition-colors hover:bg-white/10 sm:ring-0 sm:px-2 sm:underline sm:decoration-white/40 sm:underline-offset-[6px] sm:hover:bg-transparent sm:hover:decoration-white">
                  {t("See the ways to help")}
                </Link>
              </div>
              <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-white/70 sm:text-[14px]">
                {[t("Free"), t("About 3 minutes"), t("Works on any phone")].map((x) => (
                  <li key={x} className="flex items-center gap-1.5 whitespace-nowrap">
                    <Check aria-hidden className="size-3.5 text-brand-300" strokeWidth={3} />
                    {x}
                  </li>
                ))}
              </ul>
            </div>

            <LiveCard t={t} showCount={showCount} total={d.volunteers} weeks={d.weeks} thisWeek={d.momentum.thisWeek} />
          </div>
        </div>
      </section>

      {/* ── Across Nigeria: the live map beside this week's busiest LGAs ─────── */}
      {d.momentum.lgas.length > 0 && (
        <section className="container-page reveal pt-20 sm:pt-28">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="max-w-2xl">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-brand-700">{t("This week")}</p>
              <h2 className="mt-3 text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[2.75rem]">{t("{n} new verified volunteers across Nigeria", { n: fmt(d.momentum.thisWeek) })}</h2>
            </div>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
            <figure className="relative overflow-hidden rounded-[28px] bg-brand-950 p-6 text-white sm:p-10">
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_70%_40%,rgb(18_166_80/0.25),transparent_70%)]" />
              <DotMap
                byState={d.byState}
                recentByState={d.momentum.recentByState}
                label={t("Map of Nigeria: states light up by verified volunteers; pulses mark the most sign-ups this week")}
                className="relative h-auto w-full"
              />
              <figcaption className="relative mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-white/65">
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
            <ul className="grid grid-cols-2 gap-px self-stretch overflow-hidden rounded-[28px] border border-line bg-line">
              {d.momentum.lgas.map((l) => (
                <li key={l.lga} className="flex min-h-36 flex-col justify-between gap-6 bg-white p-5 sm:p-6">
                  <p className="num text-[30px] font-bold leading-none tracking-tight text-brand-800">+{fmt(l.recent)}</p>
                  <div>
                    <p className="text-[15px] font-semibold leading-snug">{l.lgaName}</p>
                    <p className="text-[13px] text-ink-muted">{l.state === "FCT" ? "FCT" : l.stateName}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
          {showCount && (
            <p className="text-[15px] text-ink-muted">
              <span className="num text-[28px] font-bold tracking-tight text-brand-800">{fmt(d.volunteers)}</span> {t("verified volunteers so far, in {s} states", { s: statesActive })}
            </p>
          )}
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
    <div className="rounded-3xl bg-surface-alt p-7 sm:p-8">
      <span className="grid size-12 place-items-center rounded-full bg-white text-brand-700 shadow-[0_1px_2px_rgb(26_26_26/0.08)]">
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

/**
 * The white card floating bottom-right of the hero: the live national figure
 * and eight weeks of verified sign-ups as two-tone bars. Before there is
 * anything to count it says what is true instead: every state is open.
 */
function LiveCard({ t, showCount, total, weeks, thisWeek }) {
  const max = Math.max(1, ...weeks);
  return (
    <div className="hidden w-[19.5rem] shrink-0 rounded-[22px] bg-white p-5 text-ink shadow-[0_30px_60px_-24px_rgb(0_0_0/0.55)] ring-1 ring-black/5 md:block lg:w-[21rem]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[17px] font-bold tracking-tight">{showCount ? t("Volunteers") : t("Open nationwide")}</p>
        {showCount && thisWeek > 0 && (
          <span className="num rounded-full bg-brand-700 px-2.5 py-1 text-[12px] font-semibold text-white">+{fmt(thisWeek)} {t("this week")}</span>
        )}
      </div>
      {showCount ? (
        <>
          <p className="num mt-3 text-[40px] font-bold leading-none tracking-[-0.03em] text-brand-900">{fmt(total)}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{t("verified across Nigeria")}</p>
          <div className="mt-5 flex h-24 items-end gap-2" aria-hidden>
            {weeks.map((n, i) => {
              const h = Math.max(10, Math.round((n / max) * 100));
              const last = i === weeks.length - 1;
              return (
                <div key={i} className="flex h-full flex-1 flex-col justify-end gap-1">
                  <div className={cx("rounded-[5px]", last ? "bg-accent-500" : "bg-brand-800")} style={{ height: `${h * 0.62}%` }} />
                  <div className={cx("rounded-[5px]", last ? "bg-accent-300" : "bg-brand-200")} style={{ height: `${h * 0.38}%` }} />
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex justify-between text-[11.5px] text-ink-muted">
            <span>{t("8 weeks ago")}</span>
            <span>{t("This week")}</span>
          </p>
        </>
      ) : (
        <>
          <p className="num mt-3 text-[40px] font-bold leading-none tracking-[-0.03em] text-brand-900">37</p>
          <p className="mt-1 text-[13px] text-ink-muted">{t("36 states and the FCT are open for registration")}</p>
          <Link href="/volunteer" className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-700 hover:text-brand-900">
            {t("Be the first in your ward")}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
}

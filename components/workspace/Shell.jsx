"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ShieldCheck, HandHeart, CalendarCheck, Images, ListTodo, Send, Map, Vote, ClipboardList,
  FileDown, Settings, LogOut, Menu, X, ExternalLink, UserPlus, IdCard, Award, KeyRound,
} from "lucide-react";

import { useT } from "@/lib/i18n/client";
import { Logo, cx } from "@/components/ui";
import LanguageSwitch from "@/components/site/LanguageSwitch";

const NAV = [
  { href: "/workspace", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/workspace/verify", label: "Verification", icon: ShieldCheck, power: "verify", count: "verify" },
  { href: "/workspace/volunteers", label: "Volunteers", icon: HandHeart, anyOf: ["verify", "summary_only", "message", "field_agent"] },
  { href: "/workspace/agent", label: "Field registration", icon: UserPlus, power: "field_agent" },
  { href: "/workspace/activities", label: "Activities", icon: CalendarCheck, power: "view_media" },
  { href: "/workspace/media", label: "Media library", icon: Images, power: "view_media", count: "media" },
  { href: "/workspace/tasks", label: "Tasks", icon: ListTodo, power: "view_media" },
  { href: "/workspace/messages", label: "Messages", icon: Send, power: "message", count: "messages" },
  { href: "/workspace/map", label: "Map and coverage", icon: Map, power: "verify" },
  { href: "/workspace/election", label: "Election day", icon: Vote, power: "election" },
  { href: "/workspace/exports", label: "Reports and exports", icon: FileDown, power: "request_export", count: "exports" },
  { href: "/workspace/privacy", label: "Data requests", icon: ClipboardList, power: "data_requests" },
  { href: "/workspace/settings", label: "Settings", icon: Settings, power: "audit" },
];

/** A volunteer's own menu: just their record. */
const VOLUNTEER_NAV = [
  { href: "/workspace", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/workspace#id-card-title", label: "My ID card", icon: IdCard, exact: true, match: "never" },
  { href: "/workspace#certificate", label: "My certificate", icon: Award, exact: true, match: "never" },
  { href: "/workspace#password", label: "Change password", icon: KeyRound, exact: true, match: "never" },
];

export default function WorkspaceShell({ viewer, areaLabel, counts, electionOn, volunteerMode, children }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const items = volunteerMode ? VOLUNTEER_NAV : NAV.filter((n) => (!n.power || viewer.powers.includes(n.power)) && (!n.anyOf || n.anyOf.some((p) => viewer.powers.includes(p))));

  async function signOut() {
    await fetch("/api/v1/auth/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ which: "user" }) });
    router.push(volunteerMode ? "/login" : "/signin");
    router.refresh();
  }

  const nav = (
    <nav aria-label={t("Workspace")} className="flex flex-col gap-0.5">
      {items.map((n) => {
        const active = n.match === "never" ? false : n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`);
        const Icon = n.icon;
        const count = n.count ? counts[n.count] : 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-[15px] transition-colors",
              active ? "bg-surface-alt font-semibold text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-700" : "font-medium text-ink-muted hover:bg-surface-alt hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
            <span className="flex-1 truncate">{t(n.label)}</span>
            {n.href === "/workspace/election" && (
              <span className={cx("text-[12px] font-semibold", electionOn ? "text-danger" : "text-ink-muted")}>
                {electionOn ? t("Live") : t("Off")}
              </span>
            )}
            {count > 0 && (
              <span className="text-[13px] font-semibold text-ink num" aria-label={t("{n} waiting", { n: count })}>
                {count > 999 ? "999+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const identity = (
    <div className="border-b border-line px-3 pb-4">
      <p className="truncate text-[15px] font-semibold">{viewer.name}</p>
      <p className="truncate text-[13px] text-ink-muted">{volunteerMode ? areaLabel : `${viewer.roles.map((r) => t(r)).join(" · ")} · ${areaLabel}`}</p>
    </div>
  );

  return (
    <div className="ws min-h-dvh bg-white lg:grid lg:grid-cols-[256px_1fr]">
      <a href="#ws-main" className="skip-link">{t("Skip to content")}</a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto border-r border-line bg-white p-3 lg:flex">
        <Link href="/workspace" className="flex items-center gap-2.5 px-3 pt-2">
          <Logo size={30} />
          <span className="text-[15px] font-bold">{volunteerMode ? t("My volunteer dashboard") : t("Workspace")}</span>
        </Link>
        {identity}
        {nav}
        <div className="mt-auto space-y-1 border-t border-line pt-3">
          <Link href="/" className="flex min-h-10 items-center gap-2 rounded-md px-3 text-[14px] text-ink-muted hover:bg-surface-alt hover:text-ink">
            <ExternalLink aria-hidden className="size-4" /> {t("Public website")}
          </Link>
          <button type="button" onClick={signOut} className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-[14px] text-ink-muted hover:bg-surface-alt hover:text-ink">
            <LogOut aria-hidden className="size-4" /> {t("Sign out")}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-white px-2 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-md hover:bg-surface-alt" aria-expanded={open} aria-controls="ws-drawer">
          <Menu aria-hidden className="size-6" />
          <span className="sr-only">{t("Menu")}</span>
        </button>
        <Logo size={26} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{areaLabel}</span>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" id="ws-drawer">
          <button type="button" aria-label={t("Close menu")} className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-xs flex-col gap-4 overflow-y-auto bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="px-3 text-[15px] font-bold">{volunteerMode ? t("My volunteer dashboard") : t("Workspace")}</span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-md hover:bg-surface-alt">
                <X aria-hidden className="size-6" />
                <span className="sr-only">{t("Close menu")}</span>
              </button>
            </div>
            {identity}
            {nav}
            <div className="mt-auto space-y-2 border-t border-line pt-3">
              <LanguageSwitch />
              <button type="button" onClick={signOut} className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-[15px] text-ink-muted hover:bg-surface-alt">
                <LogOut aria-hidden className="size-4" /> {t("Sign out")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-w-0">
        <div className="hidden h-14 items-center justify-end gap-3 px-8 lg:flex">
          <LanguageSwitch />
        </div>
        <main id="ws-main" className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-4 sm:px-8 lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
}

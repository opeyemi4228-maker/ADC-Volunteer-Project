"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, ShieldCheck, HandHeart, CalendarCheck, Images, ListTodo, Send, Map, Vote, ClipboardList,
  FileDown, Settings, LogOut, Menu, X, ExternalLink, UserPlus, IdCard, Award, KeyRound, Search, Bell,
  PanelLeftClose, PanelLeftOpen, ChevronDown, ArrowRight, CheckCircle2, Share2, Check, Radio, CornerDownLeft, UsersRound, GraduationCap,
} from "lucide-react";

import { useT } from "@/lib/i18n/client";
import { Logo, cx } from "@/components/ui";
import LanguageSwitch from "@/components/site/LanguageSwitch";
import { Avatar } from "@/components/workspace/Avatar";

/** The admin menu, in groups. Settings sits at the foot of the sidebar with the other account links. */
const NAV = [
  { group: null, items: [
    { href: "/workspace", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/workspace/verify", label: "Verification", icon: ShieldCheck, power: "verify", count: "verify" },
    { href: "/workspace/volunteers", label: "Volunteers", icon: HandHeart, power: "view_volunteers" },
    { href: "/workspace/agent", label: "Field registration", icon: UserPlus, power: "field_agent" },
    { href: "/workspace/map", label: "Map and coverage", icon: Map, power: "view_map" },
  ] },
  { group: "Engagement", items: [
    { href: "/workspace/activities", label: "Activities", icon: CalendarCheck, power: "view_media", count: "activities" },
    { href: "/workspace/media", label: "Media library", icon: Images, power: "view_media", count: "media" },
    { href: "/workspace/tasks", label: "Tasks", icon: ListTodo, anyOf: ["assign_tasks", "view_media"] },
    { href: "/workspace/messages", label: "Messages", icon: Send, power: "message", count: "messages" },
    { href: "/workspace/training", label: "Training", icon: GraduationCap },
  ] },
  { group: "Operations", items: [
    { href: "/workspace/election", label: "Election day", icon: Vote, power: "election" },
    { href: "/workspace/exports", label: "Reports and exports", icon: FileDown, power: "request_export", count: "exports" },
    { href: "/workspace/privacy", label: "Data requests", icon: ClipboardList, power: "data_requests" },
  ] },
  { group: "Administration", items: [
    { href: "/workspace/team", label: "Team and positions", icon: UsersRound, power: "manage_users" },
  ] },
];
const FOOT = [{ href: "/workspace/settings", label: "Settings", icon: Settings, power: "audit" }];

/** A volunteer's own menu: their work, their messages and their record. */
const VOLUNTEER_NAV = [
  { group: null, items: [
    { href: "/workspace", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/workspace/my/tasks", label: "My tasks", icon: ListTodo, count: "tasks" },
    { href: "/workspace/my/activities", label: "My activities", icon: CalendarCheck },
    { href: "/workspace/my/media", label: "Photos and videos", icon: Images },
    { href: "/workspace/my/messages", label: "Messages", icon: Send, count: "inbox" },
    { href: "/workspace/training", label: "Training", icon: GraduationCap },
  ] },
  { group: "My record", items: [
    { href: "/workspace#id-card-title", label: "My ID card", icon: IdCard, match: "never" },
    { href: "/workspace#certificate", label: "My certificate", icon: Award, match: "never" },
    { href: "/workspace#password", label: "Change password", icon: KeyRound, match: "never" },
  ] },
];

/** What each waiting count means, for the notifications menu. */
const ALERTS = [
  { key: "verify", href: "/workspace/verify", one: "record waiting for verification", many: "records waiting for verification", icon: ShieldCheck },
  { key: "activities", href: "/workspace/activities?review=submitted", one: "volunteer activity to review", many: "volunteer activities to review", icon: CalendarCheck },
  { key: "media", href: "/workspace/media?status=pending", one: "photo or video to review", many: "photos and videos to review", icon: Images },
  { key: "tasks", href: "/workspace/my/tasks", one: "task waiting for your report", many: "tasks waiting for your report", icon: ListTodo },
  { key: "exports", href: "/workspace/exports", one: "export request to approve", many: "export requests to approve", icon: FileDown },
  { key: "messages", href: "/workspace/messages", one: "message campaign to approve", many: "message campaigns to approve", icon: Send },
];

const allowed = (viewer) => (n) => (!n.power || viewer.powers.includes(n.power)) && (!n.anyOf || n.anyOf.some((p) => viewer.powers.includes(p)));

/** Closes a popover on outside click and Escape. */
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, setOpen, ref]);
}

export default function WorkspaceShell({ viewer, areaLabel, counts, electionOn, volunteerMode, children }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("ws-sidebar") === "collapsed"); } catch { /* storage blocked */ }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      try { localStorage.setItem("ws-sidebar", c ? "open" : "collapsed"); } catch { /* storage blocked */ }
      return !c;
    });
  }

  const ok = allowed(viewer);
  const groups = (volunteerMode ? VOLUNTEER_NAV : NAV)
    .map((g) => ({ ...g, items: g.items.filter(ok) }))
    .filter((g) => g.items.length);
  const foot = volunteerMode ? [] : FOOT.filter(ok);
  const flat = [...groups.flatMap((g) => g.items), ...foot];

  async function signOut() {
    await fetch("/api/v1/auth/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ which: "user" }) });
    router.push(volunteerMode ? "/login" : "/signin");
    router.refresh();
  }

  const isActive = (n) => (n.match === "never" ? false : n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`));

  const navLink = (n, rail) => {
    const active = isActive(n);
    const Icon = n.icon;
    const count = n.count ? counts[n.count] : 0;
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? "page" : undefined}
        title={rail ? t(n.label) : undefined}
        className={cx(
          "group relative flex min-h-10 items-center gap-3 rounded-[10px] text-[14px] transition-colors",
          rail ? "justify-center px-0" : "px-3",
          active ? "bg-brand-50 font-semibold text-brand-800" : "font-medium text-ink-muted hover:bg-surface-alt hover:text-ink",
        )}
      >
        {active && <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-brand-600" />}
        <Icon aria-hidden className={cx("size-[18px] shrink-0", active ? "text-brand-700" : "text-ink-muted group-hover:text-ink")} strokeWidth={1.9} />
        {!rail && <span className="flex-1 truncate">{t(n.label)}</span>}
        {!rail && n.href === "/workspace/election" && (
          <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", electionOn ? "bg-danger-bg text-danger" : "bg-surface-alt text-ink-muted")}>
            {electionOn ? t("Live") : t("Off")}
          </span>
        )}
        {count > 0 && (
          rail ? (
            <span aria-label={t("{n} waiting", { n: count })} className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent-500 ring-2 ring-white" />
          ) : (
            <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[12px] font-bold text-brand-800 num" aria-label={t("{n} waiting", { n: count })}>
              {count > 999 ? "999+" : count}
            </span>
          )
        )}
      </Link>
    );
  };

  const nav = (rail = false) => (
    <nav aria-label={t("Workspace")} className="flex flex-col">
      {groups.map((g, i) => (
        <div key={g.group ?? "main"} className={cx(i > 0 && "mt-3 border-t border-line pt-3")}>
          {g.group && !rail && <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted/80">{t(g.group)}</p>}
          <div className="flex flex-col gap-0.5">{g.items.map((n) => navLink(n, rail))}</div>
        </div>
      ))}
    </nav>
  );

  const footLinks = (rail = false) => (
    <div className="flex flex-col gap-0.5">
      {foot.map((n) => navLink(n, rail))}
      <Link href="/" title={rail ? t("Public website") : undefined} className={cx("flex min-h-10 items-center gap-3 rounded-[10px] text-[14px] font-medium text-ink-muted hover:bg-surface-alt hover:text-ink", rail ? "justify-center" : "px-3")}>
        <ExternalLink aria-hidden className="size-[18px]" strokeWidth={1.9} /> {!rail && t("Public website")}
      </Link>
      <button type="button" onClick={signOut} title={rail ? t("Sign out") : undefined} className={cx("flex min-h-10 w-full items-center gap-3 rounded-[10px] text-[14px] font-medium text-ink-muted hover:bg-surface-alt hover:text-ink", rail ? "justify-center" : "px-3")}>
        <LogOut aria-hidden className="size-[18px]" strokeWidth={1.9} /> {!rail && t("Sign out")}
      </button>
    </div>
  );

  const brand = (
    <Link href="/workspace" className="flex min-w-0 items-center gap-2.5">
      <Logo size={30} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-bold tracking-tight">ADC {volunteerMode ? t("Volunteer") : t("Workspace")}</span>
        <span className="block truncate text-[11px] font-medium text-ink-muted">{areaLabel}</span>
      </span>
    </Link>
  );

  return (
    <div className={cx("ws min-h-dvh bg-canvas lg:grid", collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[260px_1fr]")}>
      <a href="#ws-main" className="skip-link">{t("Skip to content")}</a>

      {/* Desktop sidebar: stays put while the page scrolls. */}
      <aside className="sticky top-0 z-40 hidden h-dvh flex-col border-r border-line bg-white lg:flex">
        <div className={cx("flex h-16 shrink-0 items-center border-b border-line", collapsed ? "justify-center px-2" : "justify-between gap-2 pl-5 pr-3")}>
          {collapsed ? (
            <button type="button" onClick={toggleCollapsed} className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-surface-alt hover:text-ink" aria-label={t("Expand sidebar")} title={t("Expand sidebar")}>
              <PanelLeftOpen aria-hidden className="size-5" strokeWidth={1.9} />
            </button>
          ) : (
            <>
              {brand}
              <button type="button" onClick={toggleCollapsed} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-surface-alt hover:text-ink" aria-label={t("Collapse sidebar")} title={t("Collapse sidebar")}>
                <PanelLeftClose aria-hidden className="size-[18px]" strokeWidth={1.9} />
              </button>
            </>
          )}
        </div>
        <div className={cx("flex min-h-0 flex-1 flex-col overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          {nav(collapsed)}
          <div className="mt-auto space-y-3 pt-6">
            <div className="border-t border-line pt-3">{footLinks(collapsed)}</div>
            {!collapsed && <SideCard volunteerMode={volunteerMode} electionOn={electionOn} canElection={viewer.powers.includes("election")} t={t} />}
          </div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" id="ws-drawer" aria-label={t("Menu")}>
          <button type="button" aria-label={t("Close menu")} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[300px] flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-line pl-4 pr-2">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-surface-alt">
                <X aria-hidden className="size-5" />
                <span className="sr-only">{t("Close menu")}</span>
              </button>
            </div>
            <div className="flex flex-1 flex-col px-3 py-4">
              {nav(false)}
              <div className="mt-auto space-y-3 pt-6">
                <div className="border-t border-line pt-3">
                  <LanguageSwitch className="mb-1 w-full" />
                  {footLinks(false)}
                </div>
                <SideCard volunteerMode={volunteerMode} electionOn={electionOn} canElection={viewer.powers.includes("election")} t={t} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        {/* Top bar: stays put while the page scrolls, on every screen size. */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-white/90 px-2 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 sm:gap-3 sm:px-4 lg:px-8">
          <button type="button" onClick={() => setOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-surface-alt lg:hidden" aria-expanded={open} aria-controls="ws-drawer">
            <Menu aria-hidden className="size-6" />
            <span className="sr-only">{t("Menu")}</span>
          </button>
          <Link href="/workspace" className="shrink-0 lg:hidden" aria-label={t("Workspace home")}><Logo size={28} /></Link>
          <CommandSearch items={flat} canSearchVolunteers={!volunteerMode && flat.some((n) => n.href === "/workspace/volunteers")} t={t} />
          <div className="flex shrink-0 items-center gap-1 sm:ml-auto sm:gap-2">
            <LanguageSwitch compact className="max-sm:hidden" />
            <Notifications counts={counts} volunteerMode={volunteerMode} t={t} />
            <AccountMenu viewer={viewer} areaLabel={areaLabel} volunteerMode={volunteerMode} onSignOut={signOut} t={t} />
          </div>
        </header>
        <main id="ws-main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-7">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Search the workspace: jump to any page, or search volunteers by name, ID or phone. ⌘K / Ctrl K focuses it. */
function CommandSearch({ items, canSearchVolunteers, t }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mobile, setMobile] = useState(false);
  const box = useRef(null);
  const input = useRef(null);
  useDismiss(open, setOpen, box);
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMobile(true);
        requestAnimationFrame(() => input.current?.focus());
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = items
      .filter((n) => !term || t(n.label).toLowerCase().includes(term))
      .map((n) => ({ key: n.href, label: t(n.label), icon: n.icon, href: n.href, hint: t("Go to page") }));
    const people = canSearchVolunteers && term
      ? [{ key: "q", label: t("Search volunteers for “{q}”", { q: q.trim() }), icon: Search, href: `/workspace/volunteers?q=${encodeURIComponent(q.trim())}`, hint: t("Name, ID or phone") }]
      : [];
    return [...people, ...pages].slice(0, 8);
  }, [q, items, canSearchVolunteers, t]);

  useEffect(() => setActive(0), [q]);

  function go(r) {
    if (!r) return;
    setOpen(false);
    setMobile(false);
    setQ("");
    input.current?.blur();
    router.push(r.href);
  }
  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
    if (e.key === "Escape") { setOpen(false); setMobile(false); input.current?.blur(); }
  }

  return (
    <>
      <button type="button" onClick={() => { setMobile(true); setOpen(true); requestAnimationFrame(() => input.current?.focus()); }} className="ml-auto grid size-11 place-items-center rounded-lg text-ink-muted hover:bg-surface-alt sm:hidden">
        <Search aria-hidden className="size-5" />
        <span className="sr-only">{t("Search")}</span>
      </button>
      <div
        ref={box}
        className={cx(
          "relative min-w-0 sm:block sm:w-full sm:max-w-[420px]",
          mobile ? "absolute inset-x-2 top-2.5 z-10 block" : "hidden",
        )}
      >
        <label className="group flex h-11 items-center gap-2.5 rounded-xl border border-line bg-surface-alt/70 px-3.5 transition-colors focus-within:border-brand-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-500/15 hover:border-[#c9cfcc] max-sm:bg-white max-sm:shadow-lg">
          <Search aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
          <span className="sr-only">{t("Search the workspace")}</span>
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={canSearchVolunteers ? t("Search volunteers or pages…") : t("Search…")}
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
            role="combobox"
            aria-expanded={open}
            aria-controls="ws-search-results"
            aria-activedescendant={open && results[active] ? `ws-r-${active}` : undefined}
            autoComplete="off"
          />
          <kbd className="hidden shrink-0 rounded-md border border-line bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-muted sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
          {mobile && (
            <button type="button" onClick={() => { setMobile(false); setOpen(false); }} className="grid size-8 place-items-center rounded-md text-ink-muted sm:hidden">
              <X aria-hidden className="size-4" /><span className="sr-only">{t("Close search")}</span>
            </button>
          )}
        </label>
        {open && results.length > 0 && (
          <ul id="ws-search-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-12px_rgb(16_24_20/0.25)]">
            {results.map((r, i) => {
              const Icon = r.icon;
              return (
                <li key={r.key} id={`ws-r-${i}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onPointerEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cx("flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px]", i === active ? "bg-brand-50 text-brand-900" : "text-ink")}
                  >
                    <span className={cx("grid size-8 shrink-0 place-items-center rounded-lg", i === active ? "bg-white text-brand-700" : "bg-surface-alt text-ink-muted")}><Icon aria-hidden className="size-4" /></span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                    <span className="shrink-0 text-[12px] text-ink-muted max-sm:hidden">{r.hint}</span>
                    {i === active && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-ink-muted" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Notifications({ counts, volunteerMode, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const items = volunteerMode ? [] : ALERTS.filter((a) => counts[a.key] > 0);
  const total = items.reduce((n, a) => n + counts[a.key], 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cx("relative grid size-10 place-items-center rounded-full border border-line bg-white text-ink-muted transition-colors hover:text-ink", open && "border-brand-600 text-ink")}
      >
        <Bell aria-hidden className="size-[18px]" strokeWidth={1.9} />
        <span className="sr-only">{total ? t("Notifications, {n} waiting", { n: total }) : t("Notifications")}</span>
        {total > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white num">{total > 99 ? "99+" : total}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(340px,calc(100vw-1rem))] rounded-xl border border-line bg-white shadow-[0_16px_40px_-12px_rgb(16_24_20/0.25)]">
          <p className="border-b border-line px-4 py-3 text-[14px] font-bold">{t("Waiting on you")}</p>
          {items.length === 0 ? (
            <p className="flex items-center gap-2.5 px-4 py-5 text-[14px] text-ink-muted"><CheckCircle2 aria-hidden className="size-5 text-success" /> {t("You're all caught up.")}</p>
          ) : (
            <ul className="p-1.5">
              {items.map((a) => {
                const Icon = a.icon;
                const n = counts[a.key];
                return (
                  <li key={a.key}>
                    <Link href={a.href} className="group flex min-h-12 items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-surface-alt">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon aria-hidden className="size-4" /></span>
                      <span className="min-w-0 flex-1 text-[14px] leading-5"><span className="font-bold num">{n > 999 ? "999+" : n}</span> {t(n === 1 ? a.one : a.many)}</span>
                      <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ viewer, areaLabel, volunteerMode, onSignOut, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const role = volunteerMode ? t("Volunteer") : viewer.roles.map((r) => t(r)).join(" · ");

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" className="flex items-center gap-2.5 rounded-full p-0.5 pr-1 transition-colors hover:bg-surface-alt sm:pr-2.5">
        <Avatar src={viewer.photo} name={viewer.name} className="size-9 text-[13px] ring-2 ring-white" />
        <span className="hidden min-w-0 text-left leading-tight md:block">
          <span className="block max-w-[160px] truncate text-[13px] font-semibold">{viewer.name}</span>
          <span className="block max-w-[160px] truncate text-[11px] text-ink-muted">{role}</span>
        </span>
        <ChevronDown aria-hidden className="hidden size-4 text-ink-muted md:block" />
        <span className="sr-only md:hidden">{t("Account")}: {viewer.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-1rem))] rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-12px_rgb(16_24_20/0.25)]">
          <div className="px-2.5 pb-3 pt-2">
            <p className="truncate text-[14px] font-bold">{viewer.name}</p>
            <p className="truncate text-[12px] text-ink-muted">{role}</p>
            <p className="truncate text-[12px] text-ink-muted">{areaLabel}</p>
          </div>
          <div className="border-t border-line pt-1.5">
            {!volunteerMode && (
              <Link href="/workspace/account" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14px] hover:bg-surface-alt"><KeyRound aria-hidden className="size-4 text-ink-muted" /> {t("Your account and password")}</Link>
            )}
            {!volunteerMode && viewer.powers.includes("audit") && (
              <Link href="/workspace/settings" className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14px] hover:bg-surface-alt"><Settings aria-hidden className="size-4 text-ink-muted" /> {t("Settings")}</Link>
            )}
            <Link href="/" className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14px] hover:bg-surface-alt"><ExternalLink aria-hidden className="size-4 text-ink-muted" /> {t("Public website")}</Link>
            <button type="button" onClick={onSignOut} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-danger hover:bg-danger-bg"><LogOut aria-hidden className="size-4" /> {t("Sign out")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The card at the foot of the sidebar: election status for admins, an invite for volunteers. */
function SideCard({ volunteerMode, electionOn, canElection, t }) {
  const [copied, setCopied] = useState(false);
  async function invite() {
    const url = `${window.location.origin}/join`;
    const text = t("Join me as an ADC volunteer.");
    try {
      if (navigator.share) await navigator.share({ title: "ADC Volunteers", text, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2400); }
    } catch { /* dismissed */ }
  }

  const shell = "relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-4 text-white";
  const glow = <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-brand-400/30 blur-2xl" />;

  if (volunteerMode) {
    return (
      <div className={shell}>
        {glow}
        <span className="relative grid size-9 place-items-center rounded-lg bg-white/15"><Share2 aria-hidden className="size-[18px]" /></span>
        <p className="relative mt-3 text-[15px] font-bold">{t("Bring a friend")}</p>
        <p className="relative mt-1 text-[12px] leading-[18px] text-white/75">{t("Every polling unit needs volunteers. Share the sign-up link with someone you trust.")}</p>
        <button type="button" onClick={invite} className="relative mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-bold text-brand-800 transition-colors hover:bg-brand-50">
          {copied ? <><Check aria-hidden className="size-4" /> {t("Link copied")}</> : t("Invite a volunteer")}
        </button>
      </div>
    );
  }
  if (!canElection) return null;
  return (
    <div className={shell}>
      {glow}
      <span className="relative flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-lg bg-white/15"><Vote aria-hidden className="size-[18px]" /></span>
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", electionOn ? "bg-white text-danger" : "bg-white/15 text-white/85")}>
          {electionOn ? <Radio aria-hidden className="live-dot size-3" /> : null}{electionOn ? t("Live") : t("Off")}
        </span>
      </span>
      <p className="relative mt-3 text-[15px] font-bold">{t("Election day")}</p>
      <p className="relative mt-1 text-[12px] leading-[18px] text-white/75">
        {electionOn ? t("Results and incidents are coming in from polling units.") : t("Check the agent roster so every polling unit is covered.")}
      </p>
      <Link href="/workspace/election" className="relative mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-white text-[13px] font-bold text-brand-800 transition-colors hover:bg-brand-50">
        {electionOn ? t("Open the live room") : t("Open agent roster")}
      </Link>
    </div>
  );
}

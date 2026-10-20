"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, ArrowRight, House, BadgeCheck, LifeBuoy, ShieldCheck, LogIn } from "lucide-react";

import { useT } from "@/lib/i18n/client";
import { Logo, cx } from "@/components/ui";
import LanguageSwitch from "./LanguageSwitch";

const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/status", label: "Check my status", icon: BadgeCheck },
  { href: "/help", label: "Help", icon: LifeBuoy },
];

const MOBILE_NAV = [
  ...NAV,
  { href: "/login", label: "Volunteer sign in", icon: LogIn },
  { href: "/signin", label: "Coordinator sign in", icon: ShieldCheck },
];

export default function SiteHeader() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  // The header always sits on its own white surface; the shadow deepens once the page has moved.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // While the mobile menu is open the page behind it shouldn't scroll, and Escape closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const isActive = (href) => (href === "/" ? pathname === "/" : !href.includes("#") && (pathname === href || pathname.startsWith(`${href}/`)));
  // On the sign-up flows themselves the header button would only compete with the form.
  const inFlow = ["/volunteer", "/signin", "/login"].some((p) => isActive(p));

  return (
    <header
      className={cx(
        "sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-md transition-shadow duration-200 supports-backdrop-filter:bg-white/85",
        scrolled || open ? "shadow-[0_8px_24px_-12px_rgb(26_26_26/0.22)]" : "shadow-[0_1px_3px_rgb(26_26_26/0.05)]",
      )}
    >
      {/* Logo colours as a thin ribbon along the top edge. */}
      <div aria-hidden className="h-[3px] bg-linear-to-r from-brand-500 via-brand-400 to-accent-500" />
      <a href="#main" className="skip-link">
        {t("Skip to content")}
      </a>
      <div className="container-page flex h-17 items-center gap-3 xl:grid xl:grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] xl:gap-5">
        <Link href="/" className="group flex min-w-0 shrink-0 items-center gap-3 justify-self-start rounded-lg" aria-label={t("ADC Volunteers System home")}>
          <span className="shrink-0 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105">
            <Logo size={36} />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="text-[17px] font-extrabold tracking-tight text-ink">ADC</span>
            <span className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted max-[359px]:hidden">
              {t("Volunteers System")}
            </span>
          </span>
        </Link>

        <nav aria-label={t("Main")} className="hidden xl:block">
          <ul className="flex items-center gap-0.5 rounded-full border border-line/70 bg-surface-alt p-1">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "relative inline-flex h-9 items-center whitespace-nowrap rounded-full px-2.5 text-[14px] font-medium 2xl:px-3 transition-all duration-150",
                      active
                        ? "bg-white font-semibold text-brand-800 shadow-[0_1px_3px_rgb(26_26_26/0.12),0_0_0_1px_rgb(26_26_26/0.04)]"
                        : "text-ink/70 hover:bg-white/70 hover:text-ink",
                    )}
                  >
                    {active && <span aria-hidden className="mr-2 size-1.5 rounded-full bg-brand-500" />}
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 justify-self-end xl:ml-0">
          <span className="hidden sm:contents">
            <LanguageSwitch compact />
          </span>
          <Link
            href="/login"
            aria-current={isActive("/login") ? "page" : undefined}
            className="hidden h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-semibold text-ink/80 transition-colors hover:bg-ink/5 hover:text-ink md:inline-flex"
          >
            <LogIn aria-hidden className="size-4" />
            {t("Sign in")}
          </Link>
          <Link
            href="/volunteer"
            className={cx(
              "btn btn-primary btn-sm group ml-1 hidden !min-h-10 gap-1.5 whitespace-nowrap !pr-3.5 shadow-[0_6px_16px_-6px_rgb(10_115_56/0.55)] hover:shadow-[0_8px_20px_-6px_rgb(10_115_56/0.65)]",
              !inFlow && "md:inline-flex",
            )}
          >
            {t("Volunteer")}
            <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <button
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-ink/5 aria-expanded:bg-ink/5 xl:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
            <span className="sr-only">{t("Menu")}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label={t("Main")} className="h-[calc(100dvh-72px)] overflow-y-auto border-t border-line bg-white xl:hidden">
          <div className="container-page flex min-h-full flex-col pb-8 pt-3">
            <ul className="space-y-1">
              {MOBILE_NAV.map((item, i) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group flex min-h-15 items-center gap-4 rounded-2xl px-3 text-[18px] font-semibold tracking-tight transition-colors",
                        active ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-ink/4",
                      )}
                    >
                      <span
                        className={cx(
                          "grid size-10 shrink-0 place-items-center rounded-xl border",
                          active ? "border-brand-200 bg-white text-brand-700" : "border-line bg-white text-ink-muted group-hover:text-ink",
                        )}
                      >
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <span className="flex-1">{t(item.label)}</span>
                      <ArrowRight aria-hidden className="size-5 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto space-y-4 pt-8">
              <Link href="/volunteer" className="btn btn-primary btn-lg w-full gap-2">
                {t("Join as a volunteer")}
                <ArrowRight aria-hidden className="size-5" />
              </Link>
              <div>
                <LanguageSwitch />
              </div>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

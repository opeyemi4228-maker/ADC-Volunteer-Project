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

/**
 * Three zones, like a good magazine masthead: the pages on the left, the
 * party's mark in the centre, the two things people come to do on the right
 * (sign in, volunteer).
 *
 * On the home page the header floats over the hero photograph (white text,
 * glass pills) and turns into the solid white bar once the hero has scrolled
 * away. Everywhere else it is the solid bar from the start.
 */
export default function SiteHeader() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [overHero, setOverHero] = useState(pathname === "/");

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4);
      const hero = document.getElementById("hero");
      setOverHero(Boolean(hero) && hero.getBoundingClientRect().bottom > 76);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);
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

  const isActive = (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  // On the sign-up flows themselves the header button would only compete with the form.
  const inFlow = ["/volunteer", "/signin", "/login"].some((p) => isActive(p));
  const glass = overHero && !open;

  return (
    <header
      className={cx(
        "sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300",
        glass
          ? "border-b border-transparent bg-transparent"
          : "border-b border-line/80 bg-white/95 backdrop-blur-md supports-backdrop-filter:bg-white/85",
        !glass && (scrolled || open) && "shadow-[0_8px_24px_-14px_rgb(26_26_26/0.25)]",
      )}
    >
      {/* Logo colours as a thin ribbon along the top edge (hidden over the photo). */}
      <div aria-hidden className={cx("h-[3px] bg-linear-to-r from-brand-500 via-brand-400 to-accent-500 transition-opacity duration-300", glass && "opacity-0")} />
      <a href="#main" className="skip-link">
        {t("Skip to content")}
      </a>
      <div className="container-page flex h-[68px] items-center gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        {/* Left: the pages, in one pill. */}
        <nav aria-label={t("Main")} className="hidden justify-self-start lg:block">
          <ul className={cx("flex items-center gap-0.5 rounded-full p-1 transition-colors duration-300", glass ? "bg-black/25 ring-1 ring-white/15 backdrop-blur-md" : "bg-surface-alt ring-1 ring-line/70")}>
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "inline-flex h-9 items-center whitespace-nowrap rounded-full px-3.5 text-[14px] font-medium transition-colors duration-150",
                      glass
                        ? active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                        : active ? "bg-white font-semibold text-brand-800 shadow-[0_1px_3px_rgb(26_26_26/0.12)]" : "text-ink/70 hover:bg-white/70 hover:text-ink",
                    )}
                  >
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Centre (desktop) / left (phones): the party's mark. */}
        <Link href="/" className="group flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg lg:justify-self-center" aria-label={t("ADC Volunteers System home")}>
          <span className="shrink-0 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105">
            <Logo size={34} />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className={cx("text-[17px] font-extrabold tracking-tight transition-colors", glass ? "text-white" : "text-ink")}>ADC</span>
            <span className={cx("mt-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.16em] transition-colors max-[359px]:hidden", glass ? "text-white/70" : "text-ink-muted")}>
              {t("Volunteers System")}
            </span>
          </span>
        </Link>

        {/* Right: language, sign in, volunteer. */}
        <div className="ml-auto flex items-center gap-1.5 justify-self-end lg:ml-0">
          <span className="hidden sm:contents">
            <LanguageSwitch compact tone={glass ? "dark" : "light"} />
          </span>
          <Link
            href="/login"
            aria-current={isActive("/login") ? "page" : undefined}
            className={cx(
              "hidden h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors md:inline-flex",
              glass ? "bg-black/25 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-black/35" : "text-ink/80 hover:bg-ink/5 hover:text-ink",
            )}
          >
            <LogIn aria-hidden className="size-4" />
            {t("Sign in")}
          </Link>
          <Link
            href="/volunteer"
            className={cx(
              "group hidden h-10 items-center gap-1.5 whitespace-nowrap rounded-full pl-4 pr-3.5 text-[14px] font-semibold transition-[background-color,box-shadow,color] duration-200",
              !inFlow && "md:inline-flex",
              glass
                ? "bg-white text-ink shadow-[0_8px_24px_-10px_rgb(0_0_0/0.5)] hover:bg-brand-50"
                : "bg-brand-700 text-white shadow-[0_6px_16px_-6px_rgb(10_115_56/0.55)] hover:bg-brand-800",
            )}
          >
            {t("Volunteer")}
            <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <button
            type="button"
            className={cx(
              "grid size-11 shrink-0 place-items-center rounded-full transition-colors lg:hidden",
              glass ? "bg-black/25 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-black/35" : "text-ink hover:bg-ink/5 aria-expanded:bg-ink/5",
            )}
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
        <nav id="mobile-nav" aria-label={t("Main")} className="h-[calc(100dvh-71px)] overflow-y-auto border-t border-line bg-white lg:hidden">
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

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages, ChevronDown } from "lucide-react";

import { LANGS, LANG_COOKIE } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/client";

/**
 * Language switch; the choice is remembered on the device for a year.
 *
 * `compact` is the header version: a quiet "EN" with a chevron, because a
 * setting people change once shouldn't compete with the page's actions. It is
 * still a real <select> (laid invisibly over the label), so the phone's own
 * picker opens and screen readers announce it properly.
 */
export default function LanguageSwitch({ tone = "light", className = "", compact = false }) {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(code) {
    document.cookie = `${LANG_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  }

  if (compact) {
    const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
    return (
      <label className={`relative inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-ink/75 transition-colors hover:bg-ink/5 hover:text-ink focus-within:outline focus-within:outline-2 focus-within:outline-accent-500 ${pending ? "opacity-60" : ""} ${className}`}>
        <Languages aria-hidden className="size-4" />
        <span aria-hidden>{current.short}</span>
        <ChevronDown aria-hidden className="size-3.5" />
        <select
          value={lang}
          onChange={(e) => choose(e.target.value)}
          disabled={pending}
          aria-label={`${t("Language")}: ${current.label}`}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t("Language")}</span>
      <Languages aria-hidden className={`pointer-events-none absolute left-2.5 size-4 ${tone === "dark" ? "text-white/85" : "text-ink-muted"}`} />
      <select
        value={lang}
        onChange={(e) => choose(e.target.value)}
        disabled={pending}
        className={`h-10 appearance-none rounded-lg border pl-8 pr-3 text-[15px] font-semibold ${
          tone === "dark" ? "border-white/30 bg-white/10 text-white [&>option]:text-ink" : "border-line bg-white text-ink"
        }`}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { ClipboardCheck } from "lucide-react";

import { useT } from "@/lib/i18n/client";

/**
 * While no SMS provider is connected, the server hands the one-time code back
 * and it is shown here instead of being texted, with a button that fills it in.
 */
export default function ScreenCode({ code, onUse }) {
  const t = useT();
  if (!code) return null;
  return (
    <div className="mt-2 space-y-2">
      <p className="text-[14px] text-ink-muted">{t("Text messages are not switched on yet, so here is your code:")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <strong className="rounded-lg bg-white px-3 py-1.5 font-mono text-[22px] tracking-[0.3em] text-ink ring-1 ring-line">{code}</strong>
        {onUse && (
          <button type="button" className="btn btn-secondary h-10 min-h-10 px-3 text-[14px]" onClick={() => onUse(code)}>
            <ClipboardCheck aria-hidden className="size-4" /> {t("Fill it in")}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Shows the first rows of a long list and folds the rest away. Children mark
 * the extra rows with `group-data-[collapsed]:hidden`; the button toggles them.
 */
export default function ShowMore({ hidden, children, className, label = "rows" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`group ${className ?? ""}`} data-collapsed={open ? undefined : ""}>
      {children}
      {hidden > 0 && (
        <div className="border-t border-line px-5 py-2.5">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
            {open ? "Show fewer" : `Show ${hidden} more ${label}`}
            <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      )}
    </div>
  );
}

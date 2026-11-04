"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

/** Copies a link and says so for a moment. */
export default function CopyLink({ url, label = "Copy link", className = "btn btn-secondary btn-sm" }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch { /* clipboard blocked */ }
  }
  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {copied ? <Check aria-hidden className="size-4 text-success" /> : <Link2 aria-hidden className="size-4" />}
      {copied ? "Link copied" : label}
    </button>
  );
}

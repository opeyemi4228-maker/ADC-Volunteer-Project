"use client";

import { Printer } from "lucide-react";

/** Prints only the ID card (see the print rules in workspace.css). */
export default function PrintCard({ className = "btn btn-secondary" }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Printer aria-hidden className="size-4" /> Print ID card
    </button>
  );
}

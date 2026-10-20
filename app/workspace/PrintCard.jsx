"use client";

import { Printer } from "lucide-react";

/** Prints only the ID card (see the print rules in workspace.css). */
export default function PrintCard() {
  return (
    <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
      <Printer aria-hidden className="size-5" /> Print ID card
    </button>
  );
}

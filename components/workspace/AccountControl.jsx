"use client";

import { useState } from "react";
import { Ban, Loader2, RotateCcw } from "lucide-react";

import { useAction } from "./actions";

/** Suspend a volunteer's sign-in (with a reason for the audit log) or restore it. */
export default function AccountControl({ volunteerId, active }) {
  const { run, busy, error } = useAction();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const call = (action) => run(`/api/v1/volunteers/${volunteerId}/account`, { action, reason }, { onDone: () => { setAsking(false); setReason(""); } });

  if (!active) {
    return (
      <div className="space-y-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => call("restore")}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RotateCcw aria-hidden className="size-4" />} Restore sign-in
        </button>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {!asking ? (
        <button type="button" className="btn btn-ghost btn-sm !text-danger" onClick={() => setAsking(true)}><Ban aria-hidden className="size-4" /> Suspend sign-in</button>
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); call("suspend"); }}>
          <label className="flex flex-col gap-1">
            <span className="t-label">Reason (kept in the audit log)</span>
            <input className="input !min-h-10" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Misusing their volunteer ID" />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-danger btn-sm" disabled={busy || reason.trim().length < 3}>Suspend now</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}

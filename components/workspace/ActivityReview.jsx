"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { cx } from "@/components/ui";
import { useAction } from "./actions";

/** Accept a volunteer's activity report, or send it back with a note they will see. */
export default function ActivityReview({ id, status }) {
  const { run, busy, error } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const send = (s, n) => run(`/api/v1/activities/${id}`, { status: s, note: n }, { method: "PATCH", onDone: () => setRejecting(false) });

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={cx("btn btn-sm", status === "approved" ? "btn-primary" : "btn-secondary")} disabled={busy || status === "approved"} onClick={() => send("approved")}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <CheckCircle2 aria-hidden className="size-4" />} {status === "approved" ? "Accepted" : "Accept"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm !text-danger" disabled={busy || status === "rejected"} onClick={() => setRejecting(!rejecting)} aria-expanded={rejecting}>
          <XCircle aria-hidden className="size-4" /> {status === "rejected" ? "Not accepted" : "Don't accept"}
        </button>
      </div>
      {rejecting && (
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); send("rejected", note); }}>
          <input className="input !min-h-10 flex-1" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? The volunteer will see this." aria-label="Reason" />
          <button className="btn btn-danger btn-sm" disabled={busy || !note.trim()}>Send</button>
        </form>
      )}
      {error && <p role="alert" className="text-[13px] font-medium text-danger">{error}</p>}
    </div>
  );
}

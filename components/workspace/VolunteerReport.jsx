"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import MediaPicker from "./MediaPicker";
import { useAction } from "./actions";

/**
 * A volunteer's progress report on a task: how many they did, a short note,
 * and photos from the work. Photos upload in the background while the rest
 * is filled in, and go to the Super Admin's media review with the report.
 */
export default function VolunteerReport({ taskId, unit, reported }) {
  const { run, busy, error } = useAction();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [media, setMedia] = useState([]);
  const [done, setDone] = useState(null);
  const uploading = media.some((m) => m.status === "uploading");

  if (done) {
    return (
      <p className="mt-3 rounded-lg bg-success-bg p-3 text-[14px] font-semibold text-success" role="status">
        Report sent. Thank you{done.media ? `, with ${done.media} ${done.media === 1 ? "photo" : "photos"} for review` : ""}.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-sm mt-3" onClick={() => setOpen(true)}>
        {reported ? "Report more progress" : "Report progress"}
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-line bg-surface-alt/60 p-3 sm:p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const out = await run(`/api/v1/tasks/${taskId}/report`, {
          achieved: Number(value),
          notes,
          media: media.filter((m) => m.status === "done").map(({ upload_id, kind, external_url, caption, consent }) => ({ upload_id, kind, external_url, caption, consent })),
        });
        if (out) setDone(out);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="flex flex-col gap-1">
          <span className="t-label">{unit ? `Number of ${unit}` : "How many did you do?"}</span>
          <input className="input" type="number" min="0" inputMode="numeric" required value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-label">What happened? <span className="font-normal text-ink-muted">(optional)</span></span>
          <input className="input" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Covered Phase 4; many people still need their PVC" />
        </label>
      </div>
      <div>
        <p className="t-label mb-2">Photos or videos <span className="font-normal text-ink-muted">(optional)</span></p>
        <MediaPicker items={media} onChange={setMedia} />
      </div>
      {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || uploading || value === ""}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
          {uploading ? "Waiting for uploads…" : "Send report"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

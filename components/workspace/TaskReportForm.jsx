"use client";

import { useState } from "react";

import { useAction } from "./actions";

/** "Report progress" on a task: a number against the target, and a note. */
export default function TaskReportForm({ taskId, unit }) {
  const { run, busy, error } = useAction();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);

  if (done) return <p className="mt-3 text-[14px] font-semibold text-success" role="status">Progress reported. Thank you.</p>;
  if (!open) return <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setOpen(true)}>Report progress</button>;
  return (
    <form
      className="mt-3 grid gap-2 rounded-xl bg-surface-alt p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const out = await run(`/api/v1/tasks/${taskId}/report`, { achieved: Number(value), notes });
        if (out) setDone(true);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="t-label">{unit ? `Number of ${unit}` : "Number achieved"}</span>
        <input className="input" type="number" min="0" inputMode="numeric" required value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-label">Notes <span className="font-normal text-ink-muted">(optional)</span></span>
        <input className="input" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}>Send</button>
      {error && <p role="alert" className="text-[14px] text-danger sm:col-span-3">{error}</p>}
    </form>
  );
}

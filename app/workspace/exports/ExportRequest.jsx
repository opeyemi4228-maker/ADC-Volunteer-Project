"use client";

import { useState } from "react";

import { useAction } from "@/components/workspace/actions";

export default function ExportRequest({ areas }) {
  const { run, busy, error } = useAction();
  const [f, setF] = useState({ kind: "volunteers", area: areas[0]?.value ?? "", reason: "" });
  const [done, setDone] = useState(false);
  return (
    <form className="card h-fit space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); const out = await run("/api/v1/exports", f); if (out) { setDone(true); setF({ ...f, reason: "" }); } }}>
      <h2 className="h-section">Request an export</h2>
      {done && <p role="status" className="rounded-lg bg-success-bg p-3 text-success">Request sent. You&apos;ll see a download button here once it is approved.</p>}
      <fieldset>
        <legend className="t-label">What</legend>
        <div className="mt-2 flex gap-2">
          {[["volunteers", "Volunteers"]].map(([v, l]) => (
            <label key={v} className="chip"><input type="radio" className="size-4 accent-brand-700" checked={f.kind === v} onChange={() => setF({ ...f, kind: v })} /> {l}</label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1"><span className="t-label">Area</span>
        <select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>{areas.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1"><span className="t-label">Why do you need it?</span>
        <textarea className="input" rows={3} maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Printing PU agent lists for Saturday's training" />
      </label>
      {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
      <button className="btn btn-primary" disabled={busy || !f.area}>Send request</button>
    </form>
  );
}

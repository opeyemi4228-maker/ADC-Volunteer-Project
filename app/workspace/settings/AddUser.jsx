"use client";

import { useState } from "react";

import { ROLE_LABELS, DIRECTORATES } from "@/lib/options";
import LocationPicker from "@/components/forms/LocationPicker";
import { useForm } from "@/components/forms/controls";
import { useAction } from "@/components/workspace/actions";

const ZONES = [["NC", "North Central"], ["NE", "North East"], ["NW", "North West"], ["SE", "South East"], ["SS", "South South"], ["SW", "South West"]];

export default function AddUser({ groups }) {
  const { run, busy, error } = useAction();
  const form = useForm({ loc: {} });
  const [f, setF] = useState({ name: "", phone: "", role: "ward_coordinator", area: "" });
  const [done, setDone] = useState(null);
  const loc = form.get("loc") ?? {};
  const geoArea = { state_coordinator: loc.state, lga_coordinator: loc.lga, field_agent: loc.lga, ward_coordinator: loc.ward }[f.role];
  const needsGeo = ["state_coordinator", "lga_coordinator", "ward_coordinator", "field_agent"].includes(f.role);

  async function submit(e) {
    e.preventDefault();
    const out = await run("/api/v1/users", { ...f, area: needsGeo ? geoArea : f.area });
    if (out) { setDone(out); setF({ name: "", phone: "", role: f.role, area: "" }); }
  }

  return (
    <form onSubmit={submit} className="card h-fit space-y-4 p-5">
      <h2 className="h-section">Give someone a role</h2>
      {done && (
        <div role="status" className="rounded-lg bg-success-bg p-3 text-[15px]">
          Role added.{done.password && <> New account. One-time password: <code className="rounded bg-white px-1.5 py-0.5 font-bold">{done.password}</code>. Share it privately. They also need their phone to sign in.</>}
        </div>
      )}
      <label className="flex flex-col gap-1"><span className="t-label">Full name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="flex flex-col gap-1"><span className="t-label">Phone number</span><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="0803 123 4567" /></label>
      <label className="flex flex-col gap-1"><span className="t-label">Role</span>
        <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, area: "" })}>
          {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {needsGeo && <LocationPicker form={form} base="loc" needWard={f.role === "ward_coordinator"} />}
      {f.role === "zonal_coordinator" && (
        <label className="flex flex-col gap-1"><span className="t-label">Zone</span><select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">Choose</option>{ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      )}
      {f.role === "directorate_head" && (
        <label className="flex flex-col gap-1"><span className="t-label">Directorate</span><select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">Choose</option>{DIRECTORATES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
      )}
      {f.role === "group_coordinator" && (
        <label className="flex flex-col gap-1"><span className="t-label">Group</span><select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">Choose</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      )}
      {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>Add role</button>
    </form>
  );
}

"use client";

import { useAction } from "@/components/workspace/actions";

const ACC = [
  ["not_started", "Not started"],
  ["submitted", "Submitted"],
  ["accredited", "Accredited"],
  ["refused", "Refused"],
];

function Slot({ pu, agent, backup, options }) {
  const { run, busy, error } = useAction();
  const call = (data) => run("/api/v1/election/agents", { pu, backup, ...data });
  if (agent) {
    return (
      <div className="space-y-1.5">
        <p className="text-[14px] font-semibold">{agent.first_name} {agent.surname}{agent.checked_in_at && <span className="ml-1 font-normal text-success">· checked in</span>}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Accreditation" className="rounded-md border border-line px-2 py-1 text-[13px]" value={agent.accreditation_status} disabled={busy} onChange={(e) => call({ action: "accreditation", status: e.target.value })}>
            {ACC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button type="button" className="text-[13px] font-semibold text-ink-muted underline" disabled={busy} onClick={() => call({ action: "unassign" })}>Remove</button>
        </div>
        {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      </div>
    );
  }
  const free = options.filter((o) => !o.assigned);
  return (
    <div>
      <select aria-label={backup ? "Assign backup agent" : "Assign primary agent"} className="w-full max-w-64 rounded-md border border-line px-2 py-1.5 text-[14px]" defaultValue="" disabled={busy || !free.length} onChange={(e) => e.target.value && call({ action: "assign", volunteerId: e.target.value })}>
        <option value="">{free.length ? "Assign…" : "Nobody available"}</option>
        {[...free].sort((a, b) => Number(b.pu === pu) - Number(a.pu === pu)).map((o) => <option key={o.id} value={o.id}>{o.pu === pu ? "★ " : ""}{o.label}</option>)}
      </select>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

export default function RosterRow({ row, options }) {
  return (
    <tr>
      <td className="min-w-52"><p className="text-[14px] font-medium">{row.name}</p><p className="text-[12px] text-ink-muted num">{row.code}</p></td>
      <td className="min-w-56"><Slot pu={row.code} agent={row.primary} backup={false} options={options} /></td>
      <td className="min-w-56"><Slot pu={row.code} agent={row.backup} backup options={options} /></td>
      <td className="text-[14px]">{row.result ? (row.result.confirmed_at ? <span className="text-success">Confirmed</span> : "Received") : <span className="text-ink-muted">—</span>}</td>
    </tr>
  );
}

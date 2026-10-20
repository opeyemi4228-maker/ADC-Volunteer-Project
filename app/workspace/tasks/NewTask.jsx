"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";

import { useForm, TextField, SelectField } from "@/components/forms/controls";
import { post } from "@/components/workspace/actions";
import { useRouter } from "next/navigation";

export default function NewTask({ areas, groups }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const form = useForm({ assign: "area", area_code: areas[0]?.value ?? "", group_ids: [] });
  const [filter, setFilter] = useState("");

  if (!open) {
    return (
      <div className="mb-6">
        {msg && <p role="status" className="mb-3 font-semibold text-success">{msg}</p>}
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus aria-hidden className="size-4" /> New task</button>
      </div>
    );
  }

  const picked = new Set(form.get("group_ids"));
  const shown = groups.filter((g) => !filter || g.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 60);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await post("/api/v1/tasks", form.data);
      setMsg(`Task created and sent to ${out.assigned} group${out.assigned === 1 ? "" : "s"}.`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      form.setErrors(err.errors ?? { title: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 space-y-5 p-5" noValidate>
      <h2 className="h-section">New task</h2>
      <TextField form={form} path="title" label="Task" placeholder="e.g. Door-to-door on Saturday" maxLength={120} />
      <TextField form={form} path="description" label="Details" optional type="textarea" maxLength={1000} />
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField form={form} path="due_date" label="Due date" type="date" min={new Date().toISOString().slice(0, 10)} />
        <TextField form={form} path="target_value" label="Target" optional type="number" min="1" inputMode="numeric" />
        <TextField form={form} path="target_unit" label="Unit" optional placeholder="households, people…" maxLength={40} />
      </div>
      <SelectField form={form} path="area_code" label="Area" options={areas} />
      <fieldset>
        <legend className="t-label">Assign to</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[["area", "All verified groups in the area"], ["groups", "Choose groups"]].map(([v, l]) => (
            <label key={v} className="chip">
              <input type="radio" name="assign" value={v} checked={form.get("assign") === v} onChange={() => form.set("assign", v)} className="size-4 accent-brand-700" /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      {form.get("assign") === "groups" && (
        <div className="space-y-2">
          <input className="input" placeholder="Filter groups" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter groups" />
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            {shown.map((g) => (
              <li key={g.id}>
                <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-alt">
                  <input type="checkbox" className="size-5 accent-brand-700" checked={picked.has(g.id)} onChange={(e) => form.set("group_ids", e.target.checked ? [...picked, g.id] : [...picked].filter((x) => x !== g.id))} />
                  <span>{g.name} <span className="text-[13px] text-ink-muted">· {g.place}</span></span>
                </label>
              </li>
            ))}
          </ul>
          {form.errors.group_ids && <p role="alert" className="text-[14px] font-medium text-danger">{form.errors.group_ids}</p>}
        </div>
      )}
      <p className="t-help">Each group&apos;s coordinator gets an SMS about the task.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Create task</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

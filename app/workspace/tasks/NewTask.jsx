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
      setMsg("Task created.");
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
      <p className="t-help">Coordinators and volunteers in this area see the task.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Create task</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

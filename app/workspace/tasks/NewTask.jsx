"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";

import { useForm, TextField, SelectField } from "@/components/forms/controls";
import { post } from "@/components/workspace/actions";
import { useRouter } from "next/navigation";

import { VOLUNTEER_ROLES } from "@/lib/options";

/** Set a task for volunteers in an area, optionally only those who offered one role. */
export default function NewTask({ areas }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const form = useForm({ assign: "area", area_code: areas[0]?.value ?? "", role: "" });

  if (!open) {
    return (
      <div className="mb-6">
        {msg && <p role="status" className="mb-3 font-semibold text-success">{msg}</p>}
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus aria-hidden className="size-4" /> New task</button>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await post("/api/v1/tasks", { ...form.data, role: form.data.role || null });
      setMsg(`Task created. ${new Intl.NumberFormat("en-NG").format(out.reach ?? 0)} volunteers can see it now.`);
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
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField form={form} path="area_code" label="Area" options={areas} />
        <SelectField form={form} path="role" label="Which volunteers" optional options={VOLUNTEER_ROLES.map((r) => ({ value: r.value, label: `${r.label}s only` }))} placeholder="Everyone in the area" />
      </div>
      <p className="t-help">Every volunteer in the area (or with that role) sees the task on their dashboard and can report progress with photos.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Create task</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

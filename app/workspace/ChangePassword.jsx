"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Alert, Field } from "@/components/ui";
import { api } from "@/components/forms/api";

/** Change password, folded away until asked for. */
export default function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const r = await api("/auth/password", { method: "POST", body: { current, password } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    setMsg({ tone: "success", text: "Your password has been changed." });
    setCurrent("");
    setPassword("");
    setOpen(false);
  }

  return (
    <div id="password" className="scroll-mt-24">
      {msg && <Alert tone={msg.tone} className="mb-3">{msg.text}</Alert>}
      {!open ? (
        <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-[14px] font-semibold text-brand-700" onClick={() => { setOpen(true); setMsg(null); }}>
          <KeyRound aria-hidden className="size-4" /> Change password
        </button>
      ) : (
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field id="cp-current" label="Current password">
            {(aria) => <input {...aria} type="password" autoComplete="current-password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
          </Field>
          <Field id="cp-new" label="New password" hint="At least 8 characters, with some letters.">
            {(aria) => <input {...aria} type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />}
          </Field>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy && <Loader2 aria-hidden className="size-5 animate-spin" />} Save new password</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

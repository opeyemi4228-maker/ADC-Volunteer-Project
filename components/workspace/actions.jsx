"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, CircleHelp, XCircle, Loader2 } from "lucide-react";

import { cx } from "@/components/ui";

/** Shared client actions for the workspace: POST, show the error, refresh. */

export async function post(url, data, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json.error ?? "Something went wrong. Try again.");
    error.errors = json.errors;
    throw error;
  }
  return json;
}

export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(url, data, { method, onDone } = {}) {
    setError("");
    setBusy(true);
    try {
      const out = await post(url, data, method);
      onDone?.(out);
      start(() => router.refresh());
      return out;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy: busy || pending, error, setError };
}

export function ApiButton({ url, data, method, children, className = "btn btn-secondary btn-sm", confirm, doneLabel }) {
  const { run, busy, error } = useAction();
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        className={className}
        disabled={busy || done}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          const out = await run(url, data, { method });
          if (out && doneLabel) setDone(true);
        }}
      >
        {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {done ? doneLabel : children}
      </button>
      {error && <span role="alert" className="text-[13px] font-medium text-danger">{error}</span>}
    </span>
  );
}

const METHODS = [
  ["phone_call", "Phone call"],
  ["in_person", "In-person meeting"],
  ["known", "Known to me"],
];

const REJECT_REASONS = [
  "Could not reach on the number given",
  "Duplicate of an existing record",
  "Details could not be confirmed",
  "Not a genuine volunteer",
  "Under 18",
];

/**
 * Verify / Request info / Reject (spec §9.2). Verifying asks how it was
 * verified; rejecting needs a reason the applicant will see.
 */
export function DecisionPanel({ kind, id, status, compact = false, canDecide = true }) {
  const { run, busy, error, setError } = useAction();
  const [mode, setMode] = useState(null);
  const [method, setMethod] = useState("");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const base = `/api/v1/${kind === "group" ? "groups" : "volunteers"}/${id}`;

  if (!canDecide) return null;
  const open = (m) => {
    setMode(mode === m ? null : m);
    setError("");
  };

  async function submit() {
    if (mode === "verify") await run(`${base}/verify`, { method }, { onDone: () => setMode(null) });
    if (mode === "info") await run(`${base}/request-info`, { message: text }, { onDone: () => setMode(null) });
    if (mode === "reject") await run(`${base}/reject`, { reason: reason === "other" ? text : reason }, { onDone: () => setMode(null) });
  }

  return (
    <div className={cx("space-y-3", compact ? "" : "card p-4")}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={cx("btn btn-sm", mode === "verify" ? "btn-primary" : "btn-secondary")} onClick={() => open("verify")} aria-expanded={mode === "verify"} disabled={status === "verified"}>
          <CheckCircle2 aria-hidden className="size-4" /> {status === "verified" ? "Verified" : "Verify"}
        </button>
        <button type="button" className={cx("btn btn-sm", mode === "info" ? "btn-primary" : "btn-secondary")} onClick={() => open("info")} aria-expanded={mode === "info"}>
          <CircleHelp aria-hidden className="size-4" /> Request info
        </button>
        <button type="button" className={cx("btn btn-sm", mode === "reject" ? "btn-danger" : "btn-ghost !text-danger")} onClick={() => open("reject")} aria-expanded={mode === "reject"} disabled={status === "rejected"}>
          <XCircle aria-hidden className="size-4" /> Reject
        </button>
      </div>

      {mode === "verify" && (
        <fieldset className="rounded-xl border border-line bg-surface-alt/70 p-3">
          <legend className="px-1 text-[14px] font-semibold">How did you verify this {kind}?</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {METHODS.map(([v, l]) => (
              <label key={v} className="chip">
                <input type="radio" name={`m-${id}`} value={v} checked={method === v} onChange={() => setMethod(v)} className="size-4 accent-brand-700" />
                {l}
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-sm mt-3" disabled={!method || busy} onClick={submit}>
            {busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Confirm verification
          </button>
        </fieldset>
      )}

      {mode === "info" && (
        <div className="rounded-xl border border-line bg-surface-alt/70 p-3">
          <label className="t-label" htmlFor={`info-${id}`}>What do you need? The applicant gets an SMS asking them to sign in.</label>
          <textarea id={`info-${id}`} className="input mt-2 !min-h-20" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn btn-primary btn-sm mt-2" disabled={!text.trim() || busy} onClick={submit}>Send request</button>
        </div>
      )}

      {mode === "reject" && (
        <div className="rounded-xl border border-danger/25 bg-danger-bg/60 p-3">
          <label className="t-label" htmlFor={`rej-${id}`}>Reason (the applicant will see this)</label>
          <select id={`rej-${id}`} className="input mt-2" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason</option>
            {REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}
            <option value="other">Other…</option>
          </select>
          {reason === "other" && <input className="input mt-2" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} aria-label="Other reason" />}
          <button type="button" className="btn btn-danger btn-sm mt-2" disabled={!(reason && (reason !== "other" || text.trim())) || busy} onClick={submit}>Reject</button>
        </div>
      )}
      {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
    </div>
  );
}

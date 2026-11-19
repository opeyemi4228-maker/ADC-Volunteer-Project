"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Loader2, Pencil, Plus, X } from "lucide-react";

import { useT } from "@/lib/i18n/client";
import { bankAccountProblems } from "@/lib/banks";
import BankAccounts from "@/components/forms/BankAccounts";

/**
 * The volunteer's own bank accounts on their dashboard: shown in full (it's
 * their data), with an editor to add or change them. Volunteers who
 * registered before bank details were asked for are prompted to add one.
 */
export default function BankDetails({ accounts, ownerName }) {
  const t = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function edit() {
    setDraft(accounts.length ? accounts.map((a) => ({ bank: a.bank, other: !a.listed, number: a.number, name: a.name })) : [{}]);
    setTried(false);
    setError("");
    setEditing(true);
  }

  async function save() {
    setTried(true);
    if (Object.keys(bankAccountProblems(draft)).length) return setError(t("Check the bank details marked above."));
    setBusy(true);
    setError("");
    const res = await fetch("/api/v1/me/bank-accounts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accounts: draft }) });
    setBusy(false);
    if (!res.ok) return setError(t((await res.json().catch(() => ({}))).error ?? "Your bank details could not be saved. Try again."));
    setEditing(false);
    startTransition(() => router.refresh());
  }

  return (
    <section aria-labelledby="bank-title" className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="bank-title" className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Landmark aria-hidden className="size-4 text-brand-700" /> {t("Bank accounts")}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">{t("Where the campaign will send any payment due to you.")}</p>
        </div>
        {!editing && accounts.length > 0 && (
          <button type="button" onClick={edit} className="btn btn-secondary btn-sm"><Pencil aria-hidden className="size-4" /> {t("Change")}</button>
        )}
      </div>

      {editing ? (
        <div>
          <BankAccounts value={draft} onChange={setDraft} t={t} showErrors={tried} ownerName={ownerName} />
          {error && <p role="alert" className="mt-4 flex items-start gap-2 text-[14px] font-medium text-danger"><X aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>{t("Cancel")}</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
              {busy && <Loader2 aria-hidden className="size-4 animate-spin" />} {t("Save bank details")}
            </button>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-warning/30 bg-warning-bg p-4">
          <p className="text-[14px] font-semibold">{t("You haven't added a bank account yet.")}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{t("Add one so the campaign can pay you when payments are due.")}</p>
          <button type="button" onClick={edit} className="btn btn-primary btn-sm mt-3"><Plus aria-hidden className="size-4" /> {t("Add bank account")}</button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => (
            <li key={a.slot} className="min-w-0 rounded-xl border border-line p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{a.slot === 1 ? t("Main account") : t("Second account")}</p>
              <p className="mt-1 truncate text-[14px] font-semibold" title={a.bank}>{a.bank}</p>
              <p className="mt-0.5 font-mono text-[16px] font-bold tracking-wide">{a.display}</p>
              <p className="mt-0.5 truncate text-[13px] text-ink-muted" title={a.name}>{a.name}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

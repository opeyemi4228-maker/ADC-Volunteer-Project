"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, ShieldAlert, X } from "lucide-react";

import { VOLUNTEER_COLUMNS, COLUMN_GROUPS, COLUMN_PRESETS } from "@/lib/volunteer-columns";
import { cx, fmt } from "@/components/ui";
import { useAction } from "@/components/workspace/actions";

/**
 * "Download" for a volunteer list. The national admin (`direct`) gets the
 * file straight away; anyone else with export rights (`request`) sends the
 * same view for approval and downloads it later from Reports and exports.
 * Either way the person chooses the format and the columns.
 */
export default function DownloadVolunteers({ filters, count, mode, described = [], label = "Download", className = "btn btn-primary btn-sm" }) {
  const dialog = useRef(null);
  const [format, setFormat] = useState("xlsx");
  const [cols, setCols] = useState(() => new Set(COLUMN_PRESETS[0].columns));
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const { run, busy, error } = useAction();

  const ordered = VOLUNTEER_COLUMNS.filter((c) => cols.has(c.key));
  const personal = ordered.some((c) => c.personal);
  const preset = COLUMN_PRESETS.find((p) => p.columns.length === cols.size && p.columns.every((k) => cols.has(k)))?.key;
  const href = `/api/v1/volunteers/export?${new URLSearchParams({ ...filters, format, cols: ordered.map((c) => c.key).join(",") })}`;

  const open = () => {
    setSent(false);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const toggle = (key) => setCols((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  });

  async function request(e) {
    e.preventDefault();
    const out = await run("/api/v1/exports", { kind: "volunteers", filters, columns: ordered.map((c) => c.key).join(","), format, reason });
    if (out) {
      setSent(true);
      setReason("");
    }
  }

  if (!mode) return null;
  return (
    <>
      <button type="button" className={className} onClick={open} disabled={!count}>
        <Download aria-hidden className="size-4" /> {label}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="dl-title"
        className="m-auto w-[min(680px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-hidden rounded-xl border border-line bg-white p-0 text-ink backdrop:bg-black/50"
        onClick={(e) => e.target === dialog.current && close()}
      >
        <div className="flex max-h-[calc(100dvh-24px)] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id="dl-title" className="h-section">{mode === "direct" ? "Download volunteers" : "Request a volunteer export"}</h2>
              <p className="mt-0.5 text-[14px] text-ink-muted num">
                {fmt(count)} {count === 1 ? "volunteer" : "volunteers"}
                {described.length > 0 && <> · {described.map((d) => `${d.label}: ${d.value}`).join(" · ")}</>}
              </p>
            </div>
            <button type="button" onClick={close} className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-surface-alt">
              <X aria-hidden className="size-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          {sent ? (
            <div className="space-y-3 px-5 py-6">
              <p role="status" className="rounded-lg bg-success-bg p-3 text-[15px] text-success">
                Request sent. A national admin will review it. Once it is approved, download it from Reports and exports within 24 hours.
              </p>
              <div className="flex gap-2">
                <Link href="/workspace/exports" className="btn btn-primary btn-sm">Open Reports and exports</Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={close}>Close</button>
              </div>
            </div>
          ) : (
            <form onSubmit={mode === "request" ? request : (e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
                <fieldset>
                  <legend className="t-label">Format</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[
                      ["xlsx", "Excel", "Filterable sheet with a header row", FileSpreadsheet],
                      ["csv", "CSV", "Plain text for any program", FileText],
                    ].map(([v, l, hint, Icon]) => (
                      <label key={v} className={cx("flex cursor-pointer items-start gap-3 rounded-lg border p-3", format === v ? "border-brand-700 bg-brand-50" : "border-line hover:border-brand-600")}>
                        <input type="radio" name="format" className="sr-only" checked={format === v} onChange={() => setFormat(v)} />
                        <Icon aria-hidden className={cx("mt-0.5 size-5 shrink-0", format === v ? "text-brand-700" : "text-ink-muted")} />
                        <span>
                          <span className="block text-[15px] font-semibold">{l}</span>
                          <span className="block text-[13px] text-ink-muted">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="t-label">Columns <span className="font-normal text-ink-muted num">({cols.size} chosen)</span></legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COLUMN_PRESETS.map((p) => (
                      <button key={p.key} type="button" aria-pressed={preset === p.key} className="chip !min-h-9 !py-1 text-[14px]" onClick={() => setCols(new Set(p.columns))}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {COLUMN_GROUPS.map((g) => (
                      <div key={g}>
                        <p className="text-[13px] font-semibold text-ink-muted">{g}</p>
                        <ul className="mt-1">
                          {VOLUNTEER_COLUMNS.filter((c) => c.group === g).map((c) => (
                            <li key={c.key}>
                              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[14px]">
                                <input type="checkbox" className="size-4 accent-brand-700" checked={cols.has(c.key)} onChange={() => toggle(c.key)} />
                                <span>{c.label}</span>
                                {c.personal && <span className="rounded bg-warning-bg px-1.5 text-[11px] font-semibold text-warning">Personal</span>}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </fieldset>

                <div className="flex gap-3 rounded-lg border border-line bg-surface-alt p-3 text-[13px] text-ink-muted">
                  <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p>
                    Every row is watermarked with your name and the download is recorded in the audit log.
                    {personal ? " This file includes phone numbers or emails: keep it on a secure device and delete it when you are done." : ""}
                  </p>
                </div>

                {mode === "request" && (
                  <label className="flex flex-col gap-1">
                    <span className="t-label">Why do you need it?</span>
                    <textarea className="input !min-h-20" rows={3} maxLength={500} required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Calling PU agents in Bwari before Saturday's training" />
                  </label>
                )}
                {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
                <button type="button" className="btn btn-ghost btn-sm" onClick={close}>Cancel</button>
                {mode === "direct" ? (
                  <a
                    href={cols.size ? href : undefined}
                    aria-disabled={!cols.size}
                    className="btn btn-primary btn-sm"
                    onClick={() => setTimeout(close, 300)}
                  >
                    <Download aria-hidden className="size-4" /> Download {format === "xlsx" ? "Excel" : "CSV"}
                  </a>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busy || !cols.size || reason.trim().length < 10}>
                    {busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Send for approval
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

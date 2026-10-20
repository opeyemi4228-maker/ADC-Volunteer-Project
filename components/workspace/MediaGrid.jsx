"use client";

import { useState } from "react";
import { PlayCircle, ExternalLink, AlertTriangle, CheckCircle2, Megaphone, XCircle } from "lucide-react";

import { StatusBadge, dateLabel } from "@/components/ui";
import { useAction } from "./actions";

/** Gallery / moderation grid (spec §8.4). */
export default function MediaGrid({ items, canModerate, canPublicity, showGroup = false }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((m) => <MediaCard key={m.id} m={m} canModerate={canModerate} canPublicity={canPublicity} showGroup={showGroup} />)}
    </ul>
  );
}

function MediaCard({ m, canModerate, canPublicity, showGroup }) {
  const { run, busy, error } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const moderate = (status, extra = {}) => run(`/api/v1/media/${m.id}/moderate`, { status, ...extra }, { method: "PATCH", onDone: () => setRejecting(false) });

  return (
    <li className="card overflow-hidden">
      <div className="relative aspect-[4/3] bg-surface-alt">
        {m.kind === "photo" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/v1/media/${m.id}/file?size=medium`} alt={m.caption ?? m.event_name ?? "Event photo"} className="size-full object-cover" loading="lazy" />
        )}
        {m.kind === "video" && <video src={`/api/v1/media/${m.id}/file`} controls preload="metadata" className="size-full bg-black object-contain" />}
        {m.kind === "link" && (
          <a href={m.external_url} target="_blank" rel="noreferrer" className="grid size-full place-items-center bg-brand-900 text-white">
            <span className="flex flex-col items-center gap-2 px-4 text-center">
              <PlayCircle aria-hidden className="size-10" />
              <span className="text-[14px] font-semibold">Video link</span>
              <span className="flex items-center gap-1 break-all text-[12px] text-white/80">{new URL(m.external_url).hostname}<ExternalLink aria-hidden className="size-3" /></span>
            </span>
          </a>
        )}
        <div className="absolute left-2 top-2"><StatusBadge status={m.moderation_status} className="bg-white" label={m.moderation_status === "pending" ? "Pending review" : undefined} /></div>
      </div>
      <div className="space-y-2 p-4">
        <p className="font-semibold">{m.event_name}</p>
        <p className="text-[13px] text-ink-muted">{dateLabel(m.event_date)} · {m.place}{m.attendance ? ` · about ${m.attendance} people` : ""}</p>
        {showGroup && m.group_name && <p className="text-[13px]"><a className="link" href={`/workspace/groups/${m.group_id}?tab=gallery`}>{m.group_name}</a></p>}
        {m.caption && <p className="text-[14px]">{m.caption}</p>}
        {m.duplicate_of && <p className="flex items-center gap-1 text-[13px] font-semibold text-warning"><AlertTriangle aria-hidden className="size-4" /> Looks like a photo already uploaded</p>}
        {m.rejection_reason && <p className="text-[13px] text-danger">Reason: {m.rejection_reason}</p>}
        <p className="text-[12px] text-ink-muted">Uploader confirmed people agreed and no children are identifiable.</p>
        {canModerate && (
          <div className="flex flex-wrap gap-2 pt-1">
            {m.moderation_status !== "approved" && m.moderation_status !== "publicity" && (
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => moderate("approved")}><CheckCircle2 aria-hidden className="size-4" /> Approve</button>
            )}
            {canPublicity && m.moderation_status === "approved" && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => moderate("publicity")}><Megaphone aria-hidden className="size-4" /> Clear for publicity</button>
            )}
            {m.moderation_status !== "rejected" && (
              <button type="button" className="btn btn-ghost btn-sm !text-danger" onClick={() => setRejecting((v) => !v)} aria-expanded={rejecting}><XCircle aria-hidden className="size-4" /> Reject</button>
            )}
          </div>
        )}
        {rejecting && (
          <div className="space-y-2 rounded-lg bg-danger-bg/60 p-3">
            <label className="t-label" htmlFor={`r-${m.id}`}>Reason (the uploader will see it)</label>
            <select id={`r-${m.id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              <option>Shows violence or weapons</option>
              <option>Hate speech or attacks on a group</option>
              <option>Children can be identified</option>
              <option>Shows ballot papers or a voting cubicle</option>
              <option>Shows cash or gifts being handed out</option>
              <option>Not the uploader&apos;s to share</option>
              <option>Poor quality or unrelated</option>
            </select>
            <button type="button" className="btn btn-danger btn-sm" disabled={!reason || busy} onClick={() => moderate("rejected", { reason })}>Reject</button>
          </div>
        )}
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </div>
    </li>
  );
}

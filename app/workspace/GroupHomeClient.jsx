"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileUp, ImagePlus, Loader2, Download, Share2 } from "lucide-react";

import { uploadFile } from "@/components/forms/upload";
import { compressImage } from "@/components/workspace/compress";
import { post } from "@/components/workspace/actions";

export function InviteBox({ code, origin }) {
  const [copied, setCopied] = useState(false);
  const link = `${origin}/join/${code}`;
  const text = `Join our ADC support group as a volunteer: ${link} (code ${code})`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface-alt p-4">
      <span className="font-mono text-2xl font-bold tracking-widest">{code}</span>
      <div className="ml-auto flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>
          <Copy aria-hidden className="size-4" /> {copied ? "Link copied" : "Copy link"}
        </button>
        <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          <Share2 aria-hidden className="size-4" /> WhatsApp
        </a>
      </div>
    </div>
  );
}

function useUpload(groupId, field) {
  const router = useRouter();
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  async function upload(file) {
    setError(null);
    setMsg(null);
    setProgress(0);
    const r = await uploadFile(file, setProgress);
    if (r.error) { setProgress(null); return setError(r.error); }
    try {
      const out = await post(`/api/v1/groups/${groupId}/profile`, { [field]: r.id });
      setMsg(out.membership ? (out.membership.count != null ? `${out.membership.count} members read from the list.` : "List uploaded.") : "Saved.");
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setProgress(null);
    }
  }
  return { upload, progress, msg, error };
}

export function MembershipUpdate({ groupId, hasList }) {
  const u = useUpload(groupId, "membership_upload_id");
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className={`btn btn-secondary ${u.progress !== null ? "pointer-events-none opacity-60" : ""}`}>
          {u.progress !== null ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <FileUp aria-hidden className="size-5" />}
          {u.progress !== null ? `Uploading ${Math.round(u.progress * 100)}%` : hasList ? "Replace the list" : "Upload membership list"}
          <input
            type="file"
            accept=".csv,.pdf,.xml"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const ext = f.name.split(".").pop().toLowerCase();
              const type = { csv: "text/csv", pdf: "application/pdf", xml: "application/xml" }[ext];
              if (!type) return;
              u.upload(new File([f], f.name, { type }));
            }}
          />
        </label>
        {hasList && <a href={`/api/v1/groups/${groupId}/members-file`} className="btn btn-ghost btn-sm"><Download aria-hidden className="size-4" /> Download current list</a>}
        <a href="/api/v1/groups/member-template.csv" className="link text-[14px]">CSV template</a>
      </div>
      {u.msg && <p role="status" className="text-[14px] font-semibold text-success">{u.msg}</p>}
      {u.error && <p role="alert" className="text-[14px] font-medium text-danger">{u.error}</p>}
    </div>
  );
}

export function LogoUpdate({ groupId, hasLogo }) {
  const u = useUpload(groupId, "logo_upload_id");
  return (
    <div className="mt-4 space-y-2">
      <label className={`btn btn-secondary ${u.progress !== null ? "pointer-events-none opacity-60" : ""}`}>
        {u.progress !== null ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <ImagePlus aria-hidden className="size-5" />}
        {u.progress !== null ? `Uploading ${Math.round(u.progress * 100)}%` : hasLogo ? "Change logo" : "Upload logo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) u.upload(await compressImage(f, 1000, 0.9)); }} />
      </label>
      {u.msg && <p role="status" className="text-[14px] font-semibold text-success">{u.msg}</p>}
      {u.error && <p role="alert" className="text-[14px] font-medium text-danger">{u.error}</p>}
    </div>
  );
}

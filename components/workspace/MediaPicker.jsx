"use client";

import { useRef, useState } from "react";
import { ImagePlus, Film, Link2, Trash2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

import { uploadFile } from "@/components/forms/upload";
import { compressImage, videoDuration } from "./compress";

/**
 * Photos, videos and video links for an activity report (spec §8). Uploads
 * start as soon as a file is chosen and run in the background while the rest
 * of the form is filled in. `onChange` receives the items in the shape the
 * API attaches: { upload_id | external_url, kind, caption, consent }.
 */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/3gpp"];

export default function MediaPicker({ items, onChange }) {
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [warning, setWarning] = useState("");
  const latest = useRef(items);
  latest.current = items;

  const update = (key, patch) => onChange(latest.current.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function add(files, kind) {
    setWarning("");
    const list = [...files];
    const photos = latest.current.filter((i) => i.kind === "photo").length;
    const videos = latest.current.filter((i) => i.kind === "video").length;
    if (kind === "photo" && photos + list.length > 20) return setWarning("You can add up to 20 photos at a time.");
    if (kind === "video" && videos + list.length > 3) return setWarning("You can add up to 3 videos at a time.");
    for (const file of list) {
      const allowed = kind === "photo" ? PHOTO_TYPES : VIDEO_TYPES;
      if (!allowed.includes(file.type)) { setWarning(`${file.name}: that file type isn't supported.`); continue; }
      if (kind === "photo" && file.size > 10 * 1024 * 1024) { setWarning(`${file.name} is larger than 10 MB.`); continue; }
      if (kind === "video") {
        if (file.size > 100 * 1024 * 1024) { setWarning("This video is larger than 100 MB. Trim it, or paste a link to it on YouTube, Facebook or TikTok instead."); continue; }
        const secs = await videoDuration(file);
        if (secs && secs > 180) { setWarning("Videos can be up to 3 minutes long. Trim it, or paste a link instead."); continue; }
        const conn = navigator.connection;
        if (wifiOnly && file.size > 20 * 1024 * 1024 && conn?.type && conn.type !== "wifi") {
          setWarning("This video is over 20 MB. Connect to Wi-Fi to upload it, or turn off \"Wi-Fi only for videos\".");
          continue;
        }
      }
      const key = crypto.randomUUID();
      const preview = kind === "photo" ? URL.createObjectURL(file) : null;
      onChange([...latest.current, { key, kind, name: file.name, preview, progress: 0, status: "uploading", caption: "", consent: false }]);
      const toSend = kind === "photo" ? await compressImage(file) : file;
      const result = await uploadFile(toSend, (p) => update(key, { progress: p }));
      if (result.error) update(key, { status: "error", error: result.error });
      else update(key, { status: "done", upload_id: result.id, progress: 1 });
    }
  }

  function addLink() {
    try {
      const url = new URL(/^https?:\/\//.test(link) ? link : `https://${link}`);
      if (!/(youtube\.com|youtu\.be|facebook\.com|fb\.watch|tiktok\.com|x\.com|twitter\.com|instagram\.com)$/.test(url.hostname.replace(/^www\.|^m\./, ""))) throw new Error();
      if (latest.current.filter((i) => i.kind === "link").length >= 10) return setWarning("You can add up to 10 links.");
      onChange([...latest.current, { key: crypto.randomUUID(), kind: "link", external_url: url.toString(), status: "done", caption: "", consent: false }]);
      setLink("");
      setShowLink(false);
    } catch {
      setWarning("Paste a YouTube, Facebook, TikTok, X or Instagram video link.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => photoRef.current.click()}><ImagePlus aria-hidden className="size-5" /> Add photos</button>
        <button type="button" className="btn btn-secondary" onClick={() => videoRef.current.click()}><Film aria-hidden className="size-5" /> Add video</button>
        <button type="button" className="btn btn-ghost btn-sm self-center" onClick={() => setShowLink((v) => !v)}><Link2 aria-hidden className="size-4" /> Paste a video link instead</button>
        <input ref={photoRef} type="file" accept={PHOTO_TYPES.join(",")} multiple hidden onChange={(e) => { add(e.target.files, "photo"); e.target.value = ""; }} />
        <input ref={videoRef} type="file" accept={VIDEO_TYPES.join(",")} hidden onChange={(e) => { add(e.target.files, "video"); e.target.value = ""; }} />
      </div>
      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" checked={wifiOnly} onChange={(e) => setWifiOnly(e.target.checked)} className="size-5 accent-brand-700" />
        Use Wi-Fi only for videos over 20 MB
      </label>
      {showLink && (
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-md flex-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/watch?v=…" aria-label="Video link" />
          <button type="button" className="btn btn-secondary" onClick={addLink}>Add link</button>
        </div>
      )}
      <p className="t-help">No violence or weapons, no hate speech, no identifiable children, no ballot papers or voting cubicles, no cash or gifts being handed out, and only media you have the right to share.</p>
      {warning && <p role="alert" className="flex items-start gap-2 text-[14px] font-medium text-danger"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />{warning}</p>}

      {items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.key} className="card flex gap-3 p-3">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-alt">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {i.preview ? <img src={i.preview} alt="" className="size-full object-cover" /> : i.kind === "video" ? <Film aria-hidden className="size-7 text-ink-muted" /> : <Link2 aria-hidden className="size-7 text-ink-muted" />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate font-semibold">{i.kind === "link" ? i.external_url : i.name}</span>
                  <button type="button" className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-alt" onClick={() => onChange(latest.current.filter((x) => x.key !== i.key))}>
                    <Trash2 aria-hidden className="size-4" /><span className="sr-only">Remove</span>
                  </button>
                </div>
                {i.status === "uploading" && (
                  <div className="flex items-center gap-2 text-[13px] text-ink-muted" role="status">
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                    <div className="h-1.5 flex-1 rounded-full bg-surface-alt"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.round(i.progress * 100)}%` }} /></div>
                    <span className="num">{Math.round(i.progress * 100)}%</span>
                  </div>
                )}
                {i.status === "done" && i.kind !== "link" && <p className="flex items-center gap-1 text-[13px] font-semibold text-success"><CheckCircle2 aria-hidden className="size-4" /> Uploaded</p>}
                {i.status === "error" && <p className="text-[13px] font-medium text-danger">{i.error}</p>}
                <input className="input !min-h-10 !py-1.5 text-[15px]" maxLength={200} placeholder="Caption (optional)" value={i.caption} onChange={(e) => update(i.key, { caption: e.target.value })} aria-label="Caption" />
                <label className="flex items-start gap-2 text-[13px]">
                  <input type="checkbox" checked={i.consent} onChange={(e) => update(i.key, { consent: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-brand-700" />
                  People shown agreed to be photographed or filmed, and no children are identifiable.
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

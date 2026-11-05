"use client";

import { useEffect, useState } from "react";
import { Check, Film, Link2, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

import { useAction } from "@/components/workspace/actions";
import { uploadFile } from "@/components/forms/upload";
import { videoDuration } from "@/components/workspace/compress";
import { cx } from "@/components/ui";

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/3gpp"];
const MAX_BYTES = 200 * 1024 * 1024;

/**
 * The Super Admin's view of every training lesson and its videos, in every
 * language. A lesson is created first; then each language's video is uploaded
 * or linked separately, so a lesson can grow one translation at a time.
 */
export default function ManageTraining({ modules, languages, audiences }) {
  const [adding, setAdding] = useState(modules.length === 0);
  return (
    <div className="space-y-4">
      {adding ? (
        <ModuleForm audiences={audiences} onDone={() => setAdding(false)} onCancel={modules.length ? () => setAdding(false) : null} />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus aria-hidden className="size-5" /> Add a lesson</button>
      )}
      {modules.length > 0 && (
        <ol className="space-y-4">
          {modules.map((m, i) => <ModuleRow key={m.id} m={m} n={i + 1} languages={languages} audiences={audiences} />)}
        </ol>
      )}
    </div>
  );
}

function ModuleForm({ audiences, initial, onDone, onCancel }) {
  const [d, setD] = useState({ title: initial?.title ?? "", description: initial?.description ?? "", audience: initial?.audience ?? "all" });
  const { run, busy, error } = useAction();

  async function save(e) {
    e.preventDefault();
    const out = await run(initial ? `/api/v1/training/${initial.id}` : "/api/v1/training", d, { method: initial ? "PATCH" : "POST" });
    if (out) onDone?.();
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <h2 className="text-[16px] font-bold">{initial ? "Edit lesson" : "New lesson"}</h2>
      <label className="block">
        <span className="text-[14px] font-semibold">Title</span>
        <input className="input mt-1" value={d.title} maxLength={160} required onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Your role as a polling unit agent" />
      </label>
      <label className="block">
        <span className="text-[14px] font-semibold">What it covers <span className="font-normal text-ink-muted">(optional)</span></span>
        <textarea className="input mt-1" value={d.description} maxLength={2000} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-[14px] font-semibold">Who it is for</span>
        <select className="input mt-1" value={d.audience} onChange={(e) => setD({ ...d, audience: e.target.value })}>
          {audiences.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 aria-hidden className="size-4 animate-spin" />} {initial ? "Save changes" : "Add lesson"}</button>
        {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}

function ModuleRow({ m, n, languages, audiences }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(null);
  const { run, busy, error } = useAction();
  const byLang = Object.fromEntries(m.videos.map((v) => [v.language, v]));

  if (editing) return <li><ModuleForm audiences={audiences} initial={m} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} /></li>;

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-wider text-brand-700">Lesson {n} · {audiences.find((a) => a.value === m.audience)?.label}</p>
          <h2 className="mt-0.5 text-[17px] font-bold leading-6">{m.title}</h2>
          {m.description && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[14px] text-ink-muted">{m.description}</p>}
        </div>
        <div className="flex gap-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil aria-hidden className="size-4" /> Edit</button>
          <button
            type="button"
            className="btn btn-ghost btn-sm !text-danger"
            disabled={busy}
            onClick={() => window.confirm(`Delete “${m.title}” and all its videos? This can't be undone.`) && run(`/api/v1/training/${m.id}`, {}, { method: "DELETE" })}
          >
            <Trash2 aria-hidden className="size-4" /> Delete
          </button>
        </div>
      </div>

      <h3 className="mt-4 text-[13px] font-bold text-ink-muted">Videos by language · {m.videos.length} of {languages.length}</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {languages.map((l) => {
          const v = byLang[l.value];
          return (
            <li key={l.value}>
              {v ? (
                <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-50 pl-3 pr-1 text-[13px] font-semibold text-brand-800">
                  <Check aria-hidden className="size-3.5" /> {l.label}
                  {v.kind === "link" ? <Link2 aria-label="link" className="size-3.5 opacity-60" /> : <Film aria-label="uploaded video" className="size-3.5 opacity-60" />}
                  <button type="button" title={`Replace the ${l.label} video`} className="grid size-7 place-items-center rounded-full hover:bg-white" onClick={() => setAdding(l.value)}>
                    <Upload aria-hidden className="size-3.5" /><span className="sr-only">Replace the {l.label} video</span>
                  </button>
                  <button
                    type="button"
                    title={`Remove the ${l.label} video`}
                    className="grid size-7 place-items-center rounded-full text-danger hover:bg-white"
                    disabled={busy}
                    onClick={() => window.confirm(`Remove the ${l.label} video?`) && run(`/api/v1/training/videos/${v.id}`, {}, { method: "DELETE" })}
                  >
                    <X aria-hidden className="size-3.5" /><span className="sr-only">Remove the {l.label} video</span>
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setAdding(l.value)} className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed px-3 text-[13px] font-medium", adding === l.value ? "border-brand-600 text-brand-800" : "border-line text-ink-muted hover:border-brand-600 hover:text-brand-800")}>
                  <Plus aria-hidden className="size-3.5" /> {l.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{error}</p>}
      {adding && (
        <VideoForm
          key={adding}
          moduleId={m.id}
          language={adding}
          languages={languages}
          onLanguage={setAdding}
          onClose={() => setAdding(null)}
        />
      )}
    </li>
  );
}

function VideoForm({ moduleId, language, languages, onLanguage, onClose }) {
  const [mode, setMode] = useState("upload");
  const [link, setLink] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const { run, busy, error, setError } = useAction();
  const label = languages.find((l) => l.value === language)?.label;

  async function pick(f) {
    setError("");
    if (!f) return;
    if (!VIDEO_TYPES.includes(f.type)) return setError("Choose an MP4, MOV or 3GP video.");
    if (f.size > MAX_BYTES) return setError("This video is larger than 200 MB. Upload it to YouTube and paste the link instead.");
    setFile(f);
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    if (mode === "link") {
      if (!link.trim()) return setError("Paste the link to the video.");
      const out = await run(`/api/v1/training/${moduleId}/videos`, { language, external_url: link });
      if (out) onClose();
      return;
    }
    if (!file) return setError("Choose the video file.");
    setUploading(true);
    setProgress(0);
    const up = await uploadFile(file, setProgress, { purpose: "training" });
    setUploading(false);
    if (up.error) return setError(up.error);
    const out = await run(`/api/v1/training/${moduleId}/videos`, { language, upload_id: up.id });
    if (out) onClose();
  }

  const working = busy || uploading;
  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-xl border border-line bg-surface-alt/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          Video in
          <select className="input !min-h-10 !w-auto !py-1.5" value={language} onChange={(e) => onLanguage(e.target.value)} disabled={working}>
            {languages.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-line" role="radiogroup" aria-label="How to add it">
          {[["upload", "Upload a file", Upload], ["link", "Paste a link", Link2]].map(([k, text, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} disabled={working} onClick={() => { setMode(k); setError(""); }} className={cx("flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold", mode === k ? "bg-brand-700 text-white" : "text-ink-muted hover:text-ink")}>
              <Icon aria-hidden className="size-4" /> {text}
            </button>
          ))}
        </div>
      </div>

      {mode === "upload" ? (
        <div>
          <input type="file" accept={VIDEO_TYPES.join(",")} disabled={working} onChange={(e) => pick(e.target.files?.[0])} className="block w-full text-[14px] file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold file:text-brand-800 file:ring-1 file:ring-line" />
          <p className="t-help mt-1">MP4, MOV or 3GP, up to 200 MB. For longer lessons, upload to YouTube and paste the link.</p>
          {file && <VideoInfo file={file} />}
          {uploading && (
            <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-muted" role="status">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              <div className="h-1.5 flex-1 rounded-full bg-white"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <span className="num">{Math.round(progress * 100)}%</span>
            </div>
          )}
        </div>
      ) : (
        <label className="block">
          <span className="sr-only">Video link</span>
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/watch?v=…" disabled={working} />
          <span className="t-help mt-1 block">YouTube links play inside the page. Other links open in a new tab.</span>
        </label>
      )}

      {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={working}>{working && <Loader2 aria-hidden className="size-4 animate-spin" />} Save {label} video</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={working}>Cancel</button>
      </div>
    </form>
  );
}

function VideoInfo({ file }) {
  const [secs, setSecs] = useState(null);
  useEffect(() => {
    let live = true;
    videoDuration(file).then((s) => live && setSecs(s));
    return () => { live = false; };
  }, [file]);
  const mb = (file.size / 1024 / 1024).toFixed(1);
  const dur = secs ? ` · ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}` : "";
  return <p className="mt-1 truncate text-[13px] font-medium">{file.name} · {mb} MB{dur}</p>;
}

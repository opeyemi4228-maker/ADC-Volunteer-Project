"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, RefreshCw, Trash2, UserRound } from "lucide-react";

import { cx } from "@/components/ui";
import { uploadFile } from "./upload";
import { compressImage } from "@/components/workspace/compress";
import { PROFILE_PHOTO_MAX_MB, PROFILE_PHOTO_TYPES } from "@/lib/options";

const MAX_BYTES = PROFILE_PHOTO_MAX_MB * 1024 * 1024;
const MIN_SIDE = 240;

/** Some phones hand over HEIC with no type; go by the name then. */
function photoType(file) {
  if (file.type) return file.type;
  if (/\.(heic|heif)$/i.test(file.name)) return "image/heic";
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  return "";
}

/** Width and height if the browser can decode it (most can; some can't read HEIC, and the server checks those). */
async function dimensions(file) {
  try {
    const b = await createImageBitmap(file);
    const size = { w: b.width, h: b.height };
    b.close?.();
    return size;
  } catch {
    return null;
  }
}

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

/**
 * The registrant's photo. They take one with the camera or pick one from the
 * gallery (or drop one on a computer). It is checked here first (a photo, at
 * most 5 MB, big enough to see a face), shrunk on the phone, then uploaded.
 * The server strips location data and keeps a 960px and a 320px copy.
 * `value` is the finished upload's id; it stays empty until the upload is done.
 */
export default function PhotoUpload({ value, onChange, onBusy, onPreview, t, invalid }) {
  const camera = useRef(null);
  const gallery = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [local, setLocal] = useState(null);
  const [problem, setProblem] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  // Phones and tablets get a "Take a photo" button; computers get drag and drop.
  const [touch, setTouch] = useState(false);
  useEffect(() => { try { setTouch(window.matchMedia("(pointer: coarse)").matches); } catch {} }, []);

  // A photo uploaded earlier in this registration (restored from the saved draft) is shown from the server.
  const src = local ?? (value ? `/api/v1/media/uploads/${encodeURIComponent(value)}?preview=1` : null);


  async function take(file) {
    setProblem("");
    if (!file || busy) return;
    const type = photoType(file);
    if (!PROFILE_PHOTO_TYPES.includes(type)) return setProblem(t("This file isn't a photo. Choose a JPG, PNG, WebP or HEIC picture."));
    if (file.size > MAX_BYTES) return setProblem(t("This photo is {size} MB. The limit is {max} MB, so choose a smaller photo or take a new one.", { size: mb(file.size), max: PROFILE_PHOTO_MAX_MB }));
    if (file.size === 0) return setProblem(t("This photo is empty. Choose another one."));
    const dims = await dimensions(file);
    if (dims && Math.min(dims.w, dims.h) < MIN_SIDE) return setProblem(t("This photo is too small to see your face clearly. Choose a larger one."));

    setBusy(true);
    onBusy?.(true);
    setProgress(0);
    setStatus(t("Uploading your photo…"));
    onChange("");
    try {
      const typed = file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
      const shrunk = await compressImage(typed, 1200, 0.85);
      const url = URL.createObjectURL(shrunk);
      setLocal(url);
      onPreview?.(url);
      const up = await uploadFile(shrunk, setProgress, { purpose: "profile" });
      if (up.error) throw new Error(up.error);
      onChange(up.id);
      setStatus(t("Photo added."));
    } catch (e) {
      setLocal(null);
      onPreview?.(null);
      setStatus("");
      setProblem(t(e.message || "The photo could not be uploaded. Check your connection and try again."));
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  function remove() {
    setLocal(null);
    onPreview?.(null);
    setProblem("");
    setStatus(t("Photo removed."));
    onChange("");
  }

  const pick = (input) => input.current?.click();
  const ready = Boolean(value) && !busy;
  const pct = Math.round(progress * 100);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files?.[0]); }}
      className={cx(
        "flex flex-col items-center gap-6 rounded-3xl border-2 border-dashed p-5 transition-colors sm:flex-row sm:items-start sm:p-6",
        dragging ? "border-brand-600 bg-brand-50" : ready ? "border-brand-700/40 bg-brand-50/50" : invalid || problem ? "border-danger/60 bg-danger-bg/40" : "border-line bg-surface-alt/60",
      )}
    >
      {/* The portrait: an ID-card shaped frame. */}
      <button
        type="button"
        onClick={() => pick(gallery)}
        disabled={busy}
        aria-label={ready ? t("Change your photo") : t("Choose a photo of yourself")}
        className="group relative aspect-[4/5] w-40 shrink-0 overflow-hidden rounded-2xl bg-white shadow-[0_12px_28px_-14px_rgb(10_115_56/0.55)] ring-1 ring-line focus-visible:ring-4 focus-visible:ring-brand-500/30 sm:w-44"
      >
        {src ? (
          <img
            src={src}
            alt={t("Your photo")}
            className={cx("size-full object-cover transition-opacity", busy && "opacity-70")}
            onError={() => {
              // A HEIC the browser can't draw: show the server's copy once the upload is done.
              if (local) return setLocal(null);
              if (value) { onChange(""); setProblem(t("Your earlier photo is no longer available. Add it again.")); }
            }}
          />
        ) : (
          <span aria-hidden className="flex size-full flex-col items-center justify-end bg-gradient-to-b from-white to-brand-50 text-brand-700/35">
            <UserRound className="mb-[-14%] size-[88%]" strokeWidth={1.1} />
          </span>
        )}
        {!busy && !ready && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-brand-700/90 py-2 text-[13px] font-semibold text-white">
            <Camera className="size-4" /> {t("Add photo")}
          </span>
        )}
        {busy && (
          <span aria-hidden className="absolute inset-0 grid place-items-center bg-ink/35">
            <span className="grid size-14 place-items-center rounded-full bg-white/95 text-[13px] font-bold text-brand-800 shadow">
              {pct > 0 ? `${pct}%` : <Loader2 className="size-5 animate-spin" />}
            </span>
          </span>
        )}
        {ready && (
          <span aria-hidden className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-brand-700 text-white ring-2 ring-white">
            <Check className="size-4" strokeWidth={3} />
          </span>
        )}
      </button>

      <div className="w-full min-w-0 flex-1 space-y-4">
        {ready ? (
          <div>
            <p className="flex items-center gap-2 text-[16px] font-bold text-brand-800"><Check aria-hidden className="size-5" strokeWidth={3} /> {t("Your photo is ready")}</p>
            <p className="mt-1 text-[14px] text-ink-muted">{t("Check that your face is clear. You can change it before you finish.")}</p>
          </div>
        ) : busy ? (
          <div>
            <p className="text-[16px] font-bold">{t("Uploading your photo…")}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-line" role="progressbar" aria-label={t("Uploading your photo…")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
            <p className="mt-1.5 text-[13px] text-ink-muted">{t("Keep this page open until it finishes.")}</p>
          </div>
        ) : (
          <ul className="space-y-2 text-[14px] leading-snug">
            {[
              "Only you, facing the camera",
              "Your whole face clearly visible: no sunglasses or face covering",
              "Good light and a plain background",
              "JPG, PNG, WebP or HEIC, up to {max} MB",
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-800"><Check className="size-3" strokeWidth={3} /></span>
                <span>{t(tip, { max: PROFILE_PHOTO_MAX_MB })}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2.5">
          {touch && (
            <button type="button" className={cx("btn", ready ? "btn-secondary" : "btn-primary")} disabled={busy} onClick={() => pick(camera)}>
              <Camera aria-hidden className="size-5" /> {ready ? t("Retake") : t("Take a photo")}
            </button>
          )}
          <button type="button" className={cx("btn", ready || touch ? "btn-secondary" : "btn-primary")} disabled={busy} onClick={() => pick(gallery)}>
            {ready ? <RefreshCw aria-hidden className="size-5" /> : <ImagePlus aria-hidden className="size-5" />}
            {ready ? t("Choose another") : t("Choose from gallery")}
          </button>
          {ready && (
            <button type="button" className="btn btn-ghost text-danger" onClick={remove}>
              <Trash2 aria-hidden className="size-4" /> {t("Remove")}
            </button>
          )}
        </div>
        {!ready && !busy && !touch && <p className="text-[13px] text-ink-muted">{t("Or drag a photo here.")}</p>}

        {problem && (
          <p role="alert" className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[14px] font-medium text-danger">{problem}</p>
        )}
        <p className="sr-only" aria-live="polite">{status}</p>
      </div>

      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept={[...PROFILE_PHOTO_TYPES, ".heic", ".heif"].join(",")} hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

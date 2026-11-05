"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { uploadFile } from "@/components/forms/upload";
import { compressImage } from "./compress";
import { Avatar } from "./Avatar";
import { cx } from "@/components/ui";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * A volunteer's profile photo with a button to change or remove it. The photo
 * is shrunk on the phone, uploaded, and stripped of location data on the
 * server before it is saved to their record.
 */
export default function ProfilePhoto({ src, name, className = "size-14 text-[20px]", rounded = "rounded-2xl" }) {
  const input = useRef(null);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);

  async function choose(file) {
    setError("");
    setMenu(false);
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError("Choose a JPG, PNG, WebP or HEIC photo.");
    if (file.size > 10 * 1024 * 1024) return setError("This photo is larger than 10 MB. Choose a smaller one.");
    setBusy(true);
    setProgress(0);
    setPreview(URL.createObjectURL(file));
    try {
      const up = await uploadFile(await compressImage(file, 1200, 0.85), setProgress);
      if (up.error) throw new Error(up.error);
      const res = await fetch("/api/v1/me/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_id: up.id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "The photo could not be saved. Try again.");
      startTransition(() => router.refresh());
    } catch (e) {
      setPreview(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setMenu(false);
    if (!window.confirm("Remove your profile photo?")) return;
    setBusy(true);
    const res = await fetch("/api/v1/me/photo", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError("The photo could not be removed. Try again.");
    setPreview(null);
    startTransition(() => router.refresh());
  }

  const shown = preview ?? src;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (src && !busy ? setMenu((m) => !m) : input.current?.click())}
        disabled={busy}
        className={cx("group relative block overflow-hidden shadow-[0_8px_20px_-10px_rgb(10_115_56/0.8)] focus-visible:ring-4 focus-visible:ring-brand-500/30", rounded)}
        aria-label={src ? "Change or remove your profile photo" : "Add a profile photo"}
        aria-expanded={src ? menu : undefined}
      >
        <Avatar src={shown} name={name} className={className} rounded={rounded} />
        <span aria-hidden className={cx("absolute inset-0 grid place-items-center bg-ink/45 text-white transition-opacity", busy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
        </span>
      </button>
      {!src && !busy && (
        <span aria-hidden className="pointer-events-none absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-accent-500 text-white ring-2 ring-white">
          <Camera className="size-3.5" />
        </span>
      )}
      {busy && progress > 0 && progress < 1 && (
        <span className="absolute -bottom-2 left-1 right-1 h-1 overflow-hidden rounded-full bg-surface-alt" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading photo">
          <span className="block h-full bg-brand-600" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
      {menu && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-48 rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-12px_rgb(16_24_20/0.25)]">
          <button type="button" onClick={() => input.current?.click()} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] hover:bg-surface-alt"><Camera aria-hidden className="size-4 text-ink-muted" /> Change photo</button>
          <button type="button" onClick={remove} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-danger hover:bg-danger-bg"><Trash2 aria-hidden className="size-4" /> Remove photo</button>
        </div>
      )}
      <input ref={input} type="file" accept={TYPES.join(",")} hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <p role="alert" className="absolute left-0 top-[calc(100%+8px)] z-10 w-60 rounded-lg bg-danger-bg p-2 text-[12px] font-medium text-danger">{error}</p>}
    </div>
  );
}

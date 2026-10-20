"use client";

import { api } from "./api";

/**
 * Sends a file with the resumable protocol in /api/v1/media/uploads: create,
 * then PATCH chunks at the server's offset. A 409 means the server holds a
 * different offset (a chunk landed but its reply was lost), so we carry on
 * from there instead of starting again.
 */
export async function uploadFile(file, onProgress = () => {}) {
  const created = await api("/media/uploads", { method: "POST", body: { name: file.name, type: file.type, size: file.size } });
  if (!created.ok) return { error: created.error };
  const { id, chunkSize } = created.data;
  let offset = created.data.offset ?? 0;
  let retries = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    let res;
    try {
      res = await fetch(`/api/v1/media/uploads/${id}`, {
        method: "PATCH",
        headers: { "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
        body: chunk,
      });
    } catch {
      if (++retries > 5) return { error: "The upload stopped. Check your connection and try again." };
      await new Promise((r) => setTimeout(r, 1500 * retries));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && Number.isFinite(data.offset)) {
      offset = data.offset;
      continue;
    }
    if (!res.ok) return { error: data.error ?? "The upload failed." };
    retries = 0;
    offset = data.offset;
    onProgress(Math.min(1, offset / file.size));
    if (data.done) break;
  }
  return { id, previewUrl: `/api/v1/media/uploads/${id}?preview=1` };
}

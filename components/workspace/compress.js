"use client";

/**
 * Shrinks a photo on the phone before upload (spec §8.2): longest side
 * 1600px, JPEG at 80%. Typically 200–500 KB instead of 3–6 MB, which is most
 * of someone's data bundle saved. Re-encoding through a canvas also drops the
 * EXIF block, so GPS never leaves the device. If the browser can't decode the
 * file (some HEIC), the original is sent and the server does the same work.
 */
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Duration of a video file in seconds, or null if the browser can't tell. */
export function videoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
  });
}

import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

import { one, all, run, tx } from "./db.js";
import { uuid } from "./crypto.js";
import { PROFILE_PHOTO_MAX_MB } from "./options.js";
import { STORAGE_DIR, writeObject, readObject, deleteObject, remoteStorage } from "./objects.js";
export { STORAGE_DIR, objectPath } from "./objects.js";

/**
 * Media storage and processing (spec §8).
 *
 * Uploads arrive in chunks (a small tus-style protocol: create, then PATCH
 * chunks at an offset, HEAD to ask where to resume), so a dropped network
 * carries on from the last byte received instead of starting again.
 *
 * When the last chunk lands the file is processed:
 *   - the real type is sniffed from its bytes, never trusted from the name
 *   - photos are re-encoded, which drops ALL metadata including GPS; location
 *     comes only from the form
 *   - 320px thumbnail and 960px medium sizes are generated
 *   - SHA-256 and a perceptual hash catch exact and near-duplicate photos
 *
 * Files live under data/uploads. In production point STORAGE_DIR at a mounted
 * volume, or swap `writeObject`/`readObject` for S3-compatible object storage
 * behind a CDN.
 */

export const CHUNK_SIZE = 512 * 1024;
export const LIMITS = {
  photo: { maxBytes: 10 * 1024 * 1024, perUpload: 20 },
  video: { maxBytes: 100 * 1024 * 1024, maxSeconds: 180, perUpload: 3 },
  link: { perUpload: 10 },
  document: { maxBytes: 10 * 1024 * 1024 },
  // Training videos, uploaded by the Super Admin only. Longer lessons go on YouTube and are linked.
  training: { maxBytes: 200 * 1024 * 1024 },
  // The volunteer's own photo, required to finish registering on the website.
  profile: { maxBytes: PROFILE_PHOTO_MAX_MB * 1024 * 1024 },
};

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/3gpp"];
// Membership lists. Browsers report CSV and XML under several names.
const DOC_TYPES = ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", "application/pdf", "application/xml", "text/xml"];


export function kindForType(type) {
  if (PHOTO_TYPES.includes(type)) return "photo";
  if (VIDEO_TYPES.includes(type)) return "video";
  if (DOC_TYPES.includes(type)) return "document";
  return null;
}

export async function createUpload({ ownerHash, fileName, type, size, purpose = null }) {
  const kind = kindForType(type);
  if (!kind) return { error: "That file type isn't supported. Use JPG, PNG, WebP or HEIC photos, MP4, MOV or 3GP videos, or a CSV, PDF or XML membership list." };
  if (!Number.isInteger(size) || size <= 0) return { error: "The file is empty." };
  if (purpose === "profile") {
    if (kind !== "photo") return { error: "Choose a photo of yourself: a JPG, PNG, WebP or HEIC picture." };
    if (size > LIMITS.profile.maxBytes) return { error: `This photo is larger than ${PROFILE_PHOTO_MAX_MB} MB. Choose a smaller one.` };
  } else if (purpose === "training") {
    if (kind !== "video") return { error: "Training must be an MP4, MOV or 3GP video." };
    if (size > LIMITS.training.maxBytes) return { error: "This video is larger than 200 MB. Upload it to YouTube and paste the link instead." };
  } else if (size > LIMITS[kind].maxBytes) {
    if (kind === "document") return { error: "The membership list is larger than 10 MB. Split it into smaller files." };
    return {
      error: kind === "video"
        ? "This video is larger than 100 MB. Trim it, or paste a link to it on YouTube, Facebook or TikTok instead."
        : "This photo is larger than 10 MB. Choose a smaller photo.",
    };
  }
  return tx(async () => {
    // Serialize capacity reservations across instances, including anonymous owners.
    await one("SELECT pg_advisory_xact_lock(727002)");
    const used = await one(`SELECT count(*) AS n, COALESCE(sum(size), 0) AS bytes FROM uploads
      WHERE owner_hash = :o AND created_at > now() - interval '24 hours'`, { o: ownerHash });
    const total = await one("SELECT count(*) AS n, COALESCE(sum(size), 0) AS bytes FROM uploads WHERE done = 0");
    if (used.n >= 100 || used.bytes + size > 1024 ** 3 || total.n >= 1000 || total.bytes + size > 10 * 1024 ** 3) {
      return { error: "Upload capacity reached. Remove unfinished uploads or try again later." };
    }
    const id = uuid();
    const tempPath = remoteStorage() ? `r2:${id}` : path.join(STORAGE_DIR, "tmp", `${id}.part`);
    if (!remoteStorage()) {
      await fsp.mkdir(path.dirname(tempPath), { recursive: true });
      await fsp.writeFile(tempPath, Buffer.alloc(0));
    }
    await run(
      "INSERT INTO uploads (id, owner_hash, file_name, declared_type, size, temp_path, kind) VALUES (:id, :o, :n, :t, :s, :p, :k)",
      { id, o: ownerHash, n: String(fileName ?? "").slice(0, 120), t: type, s: size, p: tempPath, k: kind },
    );
    return { id, offset: 0, chunkSize: CHUNK_SIZE };
  });
}

export async function getUpload(id, ownerHash) {
  return await one("SELECT * FROM uploads WHERE id = :id AND owner_hash = :o", { id, o: ownerHash });
}

/** Appends a chunk at `offset`. Out-of-order chunks are refused with the real offset. */
export async function appendChunk(upload, offset, chunk) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Buffer.isBuffer(chunk) || !chunk.length || chunk.length > 1024 * 1024) {
    return { error: "Invalid upload chunk or offset." };
  }
  const result = await tx(async () => {
    // Lock and reread: the caller's offset can be stale during parallel PATCHes.
    const current = await one("SELECT * FROM uploads WHERE id = :id AND owner_hash = :o FOR UPDATE", { id: upload.id, o: upload.owner_hash });
    if (!current) return { error: "Upload not found." };
    if (current.done) return { offset: current.size, done: true };
    if (current.error) return { error: current.error };
    if (offset !== current.offset) return { conflict: true, offset: current.offset };
    if (current.offset + chunk.length > current.size) return { error: "More data than the file size declared." };
    if (current.temp_path.startsWith("r2:")) {
      if (!remoteStorage()) throw new Error("This upload requires R2 storage.");
      const key = `tmp/${current.id}/${offset}-${crypto.createHash("sha256").update(chunk).digest("hex")}`;
      await writeObject(key, chunk);
      await run(`INSERT INTO upload_chunks (upload_id, chunk_offset, storage_key, size)
        VALUES (:id, :offset, :key, :size) ON CONFLICT (upload_id, chunk_offset)
        DO UPDATE SET storage_key = EXCLUDED.storage_key, size = EXCLUDED.size`,
      { id: current.id, offset, key, size: chunk.length });
    } else {
      // Write at the committed offset instead of append: a retry after a rolled
      // back transaction replaces uncommitted bytes rather than duplicating them.
      const file = await fsp.open(current.temp_path, "r+");
      try {
        let written = 0;
        while (written < chunk.length) {
          const result = await file.write(chunk, written, chunk.length - written, offset + written);
          if (!result.bytesWritten) throw new Error("Unable to write upload chunk.");
          written += result.bytesWritten;
        }
        await file.truncate(offset + chunk.length);
        await file.sync();
      } finally { await file.close(); }
    }
    const next = offset + chunk.length;
    await run('UPDATE uploads SET "offset" = :o WHERE id = :id', { o: next, id: current.id });
    if (next === current.size) {
      const result = await finalize({ ...current, offset: next });
      return { offset: next, done: !result.error, ...result };
    }
    return { offset: next, done: false };
  });
  // Temporary objects are removed only after the database commit succeeds.
  if (result.done) await discardUploadParts(upload).catch(() => console.error("[storage] temporary upload cleanup failed"));
  return result;
}

export async function discardUploadParts(upload) {
  if (upload.temp_path.startsWith("r2:")) {
    const chunks = await all("SELECT storage_key FROM upload_chunks WHERE upload_id = :id", { id: upload.id });
    for (const chunk of chunks) await deleteObject(chunk.storage_key);
    await run("DELETE FROM upload_chunks WHERE upload_id = :id", { id: upload.id });
  } else await fsp.rm(upload.temp_path, { force: true });
}

function sniff(buf) {
  const hex = buf.subarray(0, 12).toString("hex");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  const head = buf.subarray(0, 200).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (head.startsWith("<?xml") || /^<[A-Za-z]/.test(head)) return "application/xml";
  const brand = buf.subarray(4, 12).toString("latin1");
  if (brand.startsWith("ftyp")) {
    const major = buf.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "mif1", "msf1", "heim", "heis"].includes(major)) return "image/heic";
    if (major.startsWith("3g")) return "video/3gpp";
    if (major === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

/** 64-bit difference hash: near-identical photos differ in only a few bits. */
async function dHash(image) {
  const { data } = await image.clone().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? "1" : "0";
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export async function processPhoto(buffer) {
  // rotate() applies the EXIF orientation before the metadata is dropped;
  // sharp writes no EXIF/GPS/XMP unless withMetadata() is called, and we never call it.
  const base = sharp(buffer, { failOn: "error" }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("corrupt");
  const full = await base.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  const medium = await base.clone().resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  const thumb = await base.clone().resize({ width: 320, height: 320, fit: "cover" }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  return { full, medium, thumb, phash: await dHash(base) };
}

async function finalize(upload) {
  let buffer;
  if (upload.temp_path.startsWith("r2:")) {
    const chunks = await all("SELECT storage_key, chunk_offset, size FROM upload_chunks WHERE upload_id = :id ORDER BY chunk_offset", { id: upload.id });
    const parts = [];
    let offset = 0;
    for (let i = 0; i < chunks.length; i += 8) {
      const batch = chunks.slice(i, i + 8);
      const buffers = await Promise.all(batch.map(chunk => readObject(chunk.storage_key)));
      for (let j = 0; j < batch.length; j += 1) {
        const chunk = batch[j], part = buffers[j];
        if (chunk.chunk_offset !== offset || part.length !== chunk.size) throw new Error("Upload chunk mismatch.");
        parts.push(part); offset += part.length;
      }
      await one("SELECT 1 AS keepalive");
    }
    if (offset !== upload.size) throw new Error("Incomplete upload.");
    buffer = Buffer.concat(parts, offset);
  } else buffer = await fsp.readFile(upload.temp_path);
  const mime = sniff(buffer);
  const fail = async (error) => {
    await run("UPDATE uploads SET error = :e WHERE id = :id", { e: error, id: upload.id });

    return { error };
  };
  let realKind = kindForType(mime);
  // CSV has no signature: accept declared documents that decode as text with separators.
  if (!mime && upload.kind === "document" && isCsvText(buffer)) realKind = "document";
  if (!realKind) return await fail("That file isn't a photo, video or membership list we can read.");
  if (realKind !== upload.kind) return await fail("The file contents don't match its type.");

  const day = new Date().toISOString().slice(0, 10);
  const key = `media/${day}/${upload.id}`;
  if (realKind === "document") {
    const docMime = mime ?? "text/csv";
    const ext = { "application/pdf": "pdf", "application/xml": "xml", "text/csv": "csv" }[docMime];
    await writeObject(`docs/${upload.id}.${ext}`, buffer);
    await run("UPDATE uploads SET done = 1, mime = :m, storage_key = :sk, file_hash = :fh WHERE id = :id", {
      id: upload.id, m: docMime, sk: `docs/${upload.id}.${ext}`, fh: crypto.createHash("sha256").update(buffer).digest("hex"),
    });
    return { done: true };
  }
  if (realKind === "photo") {
    let processed;
    try {
      processed = await processPhoto(buffer);
    } catch {
      return await fail("This photo seems to be damaged. Try another one.");
    }
    await writeObject(`${key}.jpg`, processed.full);
    await writeObject(`${key}-960.jpg`, processed.medium);
    await writeObject(`${key}-320.jpg`, processed.thumb);
    await run(
      `UPDATE uploads SET done = 1, mime = 'image/jpeg', storage_key = :sk, medium_key = :mk, thumbnail_key = :tk,
       file_hash = :fh, phash = :ph WHERE id = :id`,
      {
        id: upload.id, sk: `${key}.jpg`, mk: `${key}-960.jpg`, tk: `${key}-320.jpg`,
        fh: crypto.createHash("sha256").update(processed.full).digest("hex"), ph: processed.phash,
      },
    );
  } else {
    // Videos are stored as sent. Transcoding to 720p/480p H.264 and the
    // poster frame belong to a background worker with ffmpeg (see README).
    const ext = { "video/mp4": "mp4", "video/quicktime": "mov", "video/3gpp": "3gp" }[mime];
    await writeObject(`${key}.${ext}`, buffer);
    await run("UPDATE uploads SET done = 1, mime = :m, storage_key = :sk, file_hash = :fh WHERE id = :id", {
      id: upload.id, m: mime, sk: `${key}.${ext}`, fh: crypto.createHash("sha256").update(buffer).digest("hex"),
    });
  }
  return { done: true };
}

function isCsvText(buf) {
  const text = buf.subarray(0, 4096).toString("utf8");
  if (text.includes("\uFFFD") || /[\x00-\x08]/.test(text)) return false;
  return /[,;\t]/.test(text.split(/\r?\n/)[0] ?? "");
}

/** Stores an already-processed photo (seed data, WhatsApp media). Returns keys. */
export async function storePhotoBuffer(buffer) {
  const processed = await processPhoto(buffer);
  const key = `media/${new Date().toISOString().slice(0, 10)}/${uuid()}`;
  await writeObject(`${key}.jpg`, processed.full);
  await writeObject(`${key}-960.jpg`, processed.medium);
  await writeObject(`${key}-320.jpg`, processed.thumb);
  return {
    storage_key: `${key}.jpg`, medium_key: `${key}-960.jpg`, thumbnail_key: `${key}-320.jpg`, mime: "image/jpeg",
    file_hash: crypto.createHash("sha256").update(processed.full).digest("hex"), phash: processed.phash,
  };
}

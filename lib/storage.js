import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

import { one, run } from "./db.js";
import { uuid } from "./crypto.js";
import { DATA_DIR } from "./paths.js";

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

export const STORAGE_DIR = process.env.STORAGE_DIR ?? path.join(/* turbopackIgnore: true */ DATA_DIR, "uploads");
export const CHUNK_SIZE = 512 * 1024;
export const LIMITS = {
  photo: { maxBytes: 10 * 1024 * 1024, perUpload: 20 },
  video: { maxBytes: 100 * 1024 * 1024, maxSeconds: 180, perUpload: 3 },
  link: { perUpload: 10 },
  document: { maxBytes: 10 * 1024 * 1024 },
};

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/3gpp"];
// Membership lists. Browsers report CSV and XML under several names.
const DOC_TYPES = ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", "application/pdf", "application/xml", "text/xml"];


export function objectPath(key) {
  const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "");
  return path.join(/* turbopackIgnore: true */ STORAGE_DIR, safe);
}

async function writeObject(key, buffer) {
  const file = objectPath(key);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, buffer);
}

export function kindForType(type) {
  if (PHOTO_TYPES.includes(type)) return "photo";
  if (VIDEO_TYPES.includes(type)) return "video";
  if (DOC_TYPES.includes(type)) return "document";
  return null;
}

export function createUpload({ ownerHash, fileName, type, size }) {
  const kind = kindForType(type);
  if (!kind) return { error: "That file type isn't supported. Use JPG, PNG, WebP or HEIC photos, MP4, MOV or 3GP videos, or a CSV, PDF or XML membership list." };
  if (!Number.isInteger(size) || size <= 0) return { error: "The file is empty." };
  if (size > LIMITS[kind].maxBytes) {
    if (kind === "document") return { error: "The membership list is larger than 10 MB. Split it into smaller files." };
    return {
      error: kind === "video"
        ? "This video is larger than 100 MB. Trim it, or paste a link to it on YouTube, Facebook or TikTok instead."
        : "This photo is larger than 10 MB. Choose a smaller photo.",
    };
  }
  const id = uuid();
  fs.mkdirSync(path.join(STORAGE_DIR, "tmp"), { recursive: true });
  const tempPath = path.join(STORAGE_DIR, "tmp", `${id}.part`);
  fs.writeFileSync(tempPath, Buffer.alloc(0));
  run(
    "INSERT INTO uploads (id, owner_hash, file_name, declared_type, size, temp_path, kind) VALUES (:id, :o, :n, :t, :s, :p, :k)",
    { id, o: ownerHash, n: String(fileName ?? "").slice(0, 120), t: type, s: size, p: tempPath, k: kind },
  );
  return { id, offset: 0, chunkSize: CHUNK_SIZE };
}

export function getUpload(id, ownerHash) {
  return one("SELECT * FROM uploads WHERE id = :id AND owner_hash = :o", { id, o: ownerHash });
}

/** Appends a chunk at `offset`. Out-of-order chunks are refused with the real offset. */
export async function appendChunk(upload, offset, chunk) {
  if (upload.done) return { offset: upload.size, done: true };
  if (offset !== upload.offset) return { conflict: true, offset: upload.offset };
  if (upload.offset + chunk.length > upload.size) return { error: "More data than the file size declared." };
  await fsp.appendFile(upload.temp_path, chunk);
  const next = upload.offset + chunk.length;
  run("UPDATE uploads SET offset = :o WHERE id = :id", { o: next, id: upload.id });
  if (next === upload.size) {
    const result = await finalize({ ...upload, offset: next });
    return { offset: next, done: !result.error, ...result };
  }
  return { offset: next, done: false };
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
  const buffer = await fsp.readFile(upload.temp_path);
  const mime = sniff(buffer);
  const fail = (error) => {
    run("UPDATE uploads SET error = :e WHERE id = :id", { e: error, id: upload.id });
    fs.rm(upload.temp_path, { force: true }, () => {});
    return { error };
  };
  let realKind = kindForType(mime);
  // CSV has no signature: accept declared documents that decode as text with separators.
  if (!mime && upload.kind === "document" && isCsvText(buffer)) realKind = "document";
  if (!realKind) return fail("That file isn't a photo, video or membership list we can read.");
  if (realKind !== upload.kind) return fail("The file contents don't match its type.");

  const day = new Date().toISOString().slice(0, 10);
  const key = `media/${day}/${upload.id}`;
  try {
    if (realKind === "document") {
      const docMime = mime ?? "text/csv";
      const ext = { "application/pdf": "pdf", "application/xml": "xml", "text/csv": "csv" }[docMime];
      await writeObject(`docs/${upload.id}.${ext}`, buffer);
      run("UPDATE uploads SET done = 1, mime = :m, storage_key = :sk, file_hash = :fh WHERE id = :id", {
        id: upload.id, m: docMime, sk: `docs/${upload.id}.${ext}`, fh: crypto.createHash("sha256").update(buffer).digest("hex"),
      });
      return { done: true };
    }
    if (realKind === "photo") {
      let processed;
      try {
        processed = await processPhoto(buffer);
      } catch {
        return fail("This photo seems to be damaged. Try another one.");
      }
      await writeObject(`${key}.jpg`, processed.full);
      await writeObject(`${key}-960.jpg`, processed.medium);
      await writeObject(`${key}-320.jpg`, processed.thumb);
      run(
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
      run("UPDATE uploads SET done = 1, mime = :m, storage_key = :sk, file_hash = :fh WHERE id = :id", {
        id: upload.id, m: mime, sk: `${key}.${ext}`, fh: crypto.createHash("sha256").update(buffer).digest("hex"),
      });
    }
  } finally {
    fs.rm(upload.temp_path, { force: true }, () => {});
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

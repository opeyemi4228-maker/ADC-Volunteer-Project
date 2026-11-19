import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { DATA_DIR } from './paths.js';

export const STORAGE_DIR = process.env.STORAGE_DIR ?? path.join(/* turbopackIgnore: true */ DATA_DIR, 'uploads');
export const remoteStorage = () => process.env.STORAGE_BACKEND === 'r2';
export function validKey(key) {
  if (typeof key !== 'string' || !key || !/^[a-zA-Z0-9._/-]+$/.test(key) || path.isAbsolute(key) || key.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid storage key.');
  return key;
}
export function objectPath(key) { return path.join(/* turbopackIgnore: true */ STORAGE_DIR, validKey(key)); }
let client;
async function r2() {
  const sdk = await import('@aws-sdk/client-s3');
  if (!client) {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
      if (!process.env[key]) throw new Error(`${key} is required for R2 storage.`);
    }
    if (!/^[a-f0-9]{32}$/i.test(process.env.R2_ACCOUNT_ID)) throw new Error('Invalid R2_ACCOUNT_ID.');
    client = new sdk.S3Client({
      maxAttempts: 2, requestHandler: { connectionTimeout: 5000, requestTimeout: 10000 },
      region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return { sdk, client, Bucket: process.env.R2_BUCKET };
}
export async function writeObject(key, buffer) {
  validKey(key);
  if (remoteStorage()) {
    const { sdk, client, Bucket } = await r2();
    await client.send(new sdk.PutObjectCommand({ Bucket, Key: key, Body: buffer, ContentType: 'application/octet-stream' }));
  } else {
    const file = objectPath(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, buffer);
  }
}
export async function readObject(key) {
  validKey(key);
  if (!remoteStorage()) return fsp.readFile(objectPath(key));
  const { sdk, client, Bucket } = await r2();
  const response = await client.send(new sdk.GetObjectCommand({ Bucket, Key: key }));
  return Buffer.from(await response.Body.transformToByteArray());
}
export async function deleteObject(key) {
  validKey(key);
  if (!remoteStorage()) return fsp.rm(objectPath(key), { force: true });
  const { sdk, client, Bucket } = await r2();
  await client.send(new sdk.DeleteObjectCommand({ Bucket, Key: key }));
}

export function byteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size <= 0) return false;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

/** Call only after route-level authorization. R2 links expire after one minute. */
export async function objectResponse(key, request, headers = {}) {
  if (!key) return new Response('Not found', { status: 404 });
  validKey(key);
  if (remoteStorage()) {
    const { sdk, client, Bucket } = await r2();
    try { await client.send(new sdk.HeadObjectCommand({ Bucket, Key: key })); }
    catch (error) { if (error.$metadata?.httpStatusCode === 404) return new Response('Not found', { status: 404 }); throw error; }
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const url = await getSignedUrl(client, new sdk.GetObjectCommand({
      Bucket, Key: key, ResponseContentType: headers['Content-Type'],
      ResponseContentDisposition: headers['Content-Disposition'], ResponseCacheControl: 'private, no-store',
    }), { expiresIn: 60 });
    return new Response(null, { status: 307, headers: { Location: url, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  const file = objectPath(key);
  let stat;
  try { stat = await fsp.stat(file); }
  catch (error) { if (error.code === 'ENOENT') return new Response('Not found', { status: 404 }); throw error; }
  const range = byteRange(request.headers.get('range'), stat.size);
  if (range === false) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
  const out = { 'Cache-Control': 'private, no-store', ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': String(range ? range.end - range.start + 1 : stat.size) };
  if (range) out['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
  return new Response(Readable.toWeb(fs.createReadStream(file, range ?? undefined)), { status: range ? 206 : 200, headers: out });
}

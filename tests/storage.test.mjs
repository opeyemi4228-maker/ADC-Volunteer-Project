import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PGLITE_DIR = 'memory://';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-review-'));
process.env.APP_SECRET = 'storage-test-key';
for (const key of ['DATABASE_URL', 'DATABASE_URL_POOLED', 'APP_DATABASE_URL']) delete process.env[key];
let db, storage, objects;
before(async () => { db = await import('../lib/db.js'); storage = await import('../lib/storage.js'); objects = await import('../lib/objects.js'); });
after(async () => { await db.closeDb(); fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true }); });

async function exerciseUpload(owner) {
  const source = Buffer.from('name,phone\nTest,0123456789\n');
  const made = await storage.createUpload({ ownerHash: owner, fileName: 'members.csv', type: 'text/csv', size: source.length });
  assert.ok(made.id, made.error);
  const upload = await storage.getUpload(made.id, owner);
  const first = source.subarray(0, 10);
  const results = await Promise.all([storage.appendChunk(upload, 0, first), storage.appendChunk(upload, 0, first)]);
  assert.equal(results.filter(r => r.conflict).length, 1);
  assert.equal(await db.scalar('SELECT "offset" FROM uploads WHERE id = :id', { id: upload.id }), first.length);
  const invalid = await storage.appendChunk(upload, first.length, Buffer.alloc(source.length + 1));
  assert.ok(invalid.error);
  // An invalid chunk must not discard the previously accepted bytes.
  const finished = await storage.appendChunk(upload, first.length, source.subarray(first.length));
  assert.equal(finished.done, true, finished.error);
  const saved = await storage.getUpload(made.id, owner);
  assert.deepEqual(await objects.readObject(saved.storage_key), source);
  assert.equal(await db.scalar('SELECT count(*) FROM upload_chunks WHERE upload_id = :id', { id: upload.id }), 0);
  return saved;
}

test('local uploads serialize concurrent chunks and recover after rejected input', async () => {
  delete process.env.STORAGE_BACKEND;
  const saved = await exerciseUpload('local-test');
  const response = await objects.objectResponse(saved.storage_key, new Request('https://example.com', { headers: { range: 'bytes=-4' } }), { 'Content-Type': 'text/csv' });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 4);
});

test('R2 uploads persist chunks remotely and serve only expiring signed links', async () => {
  process.env.STORAGE_BACKEND = 'r2';
  Object.assign(process.env, { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test-access', R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET: 'private-test' });
  const { S3Client } = await import('@aws-sdk/client-s3');
  const remote = new Map();
  const stub = mock.method(S3Client.prototype, 'send', async command => {
    const { Key, Body, ACL } = command.input;
    assert.equal(ACL, undefined, 'objects must not be made public');
    switch (command.constructor.name) {
      case 'PutObjectCommand': remote.set(Key, Buffer.from(Body)); return {};
      case 'GetObjectCommand': assert.ok(remote.has(Key)); return { Body: { transformToByteArray: async () => remote.get(Key) } };
      case 'DeleteObjectCommand': remote.delete(Key); return {};
      case 'HeadObjectCommand': assert.ok(remote.has(Key)); return { ContentLength: remote.get(Key).length };
      default: throw new Error(command.constructor.name);
    }
  });
  try {
    const saved = await exerciseUpload('r2-test');
    assert.ok(saved.temp_path.startsWith('r2:'));
    assert.equal([...remote.keys()].filter(key => key.startsWith('tmp/')).length, 0);
    const response = await objects.objectResponse(saved.storage_key, new Request('https://example.com'), { 'Content-Type': 'text/csv' });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const url = new URL(response.headers.get('location'));
    assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
    assert.ok(url.searchParams.has('X-Amz-Signature'));
    assert.ok(url.hostname.endsWith('.r2.cloudflarestorage.com'));
    await objects.deleteObject(saved.storage_key);
    assert.equal(remote.has(saved.storage_key), false);
  } finally { stub.mock.restore(); delete process.env.STORAGE_BACKEND; }
});

test('local photo processing still strips metadata and writes valid derivatives', async () => {
  const sharp = (await import('sharp')).default;
  const source = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } }).jpeg().withMetadata().toBuffer();
  const photo = await storage.processPhoto(source);
  for (const buffer of [photo.full, photo.medium, photo.thumb]) {
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.format, 'jpeg');
    assert.equal(meta.exif, undefined);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { assetPath, assetDto, siteAssetDto, boundedBody, safeFilename, uploadAsset, MAX_UPLOAD_BYTES } from '../db/accounts/assets.mjs';
const site = '12345678-1234-4234-8234-123456789abc';

test('Site DTO emits admission time without exposing storage or upload metadata', () => {
  const row = { id: site, width: 900, height: 600, created_at: new Date('2026-09-28T08:10:12.123Z'), digest: 'private-digest', original_type: 'image/jpeg', variants: Object.fromEntries(['thumbnail', 'card', 'full', 'original'].map(kind => [kind, { width: 900, height: 600, bytes: 100, key: '/private/original.jpg' }])) };
  const dto = siteAssetDto(row, 'owner-a');
  assert.equal('createdAt' in assetDto(row, 'owner-a'), false, 'Public asset DTO retains its original metadata boundary');
  assert.equal(dto.createdAt, '2026-09-28T08:10:12.123Z');
  assert.deepEqual(Object.keys(dto).sort(), ['aspectRatio', 'createdAt', 'id', 'orientation', 'variants']);
  assert.deepEqual(Object.keys(dto.variants).sort(), ['card', 'full', 'thumbnail']);
  assert.equal(JSON.stringify(dto).includes('private'), false);
  assert.equal(siteAssetDto({ ...row, created_at: '2026-09-28T16:10:12.123+08:00' }, 'owner-a').createdAt, dto.createdAt);
  assert.equal('createdAt' in siteAssetDto({ ...row, created_at: undefined }, 'owner-a'), false);
});

test('Site storage keys and filename reject traversal, local paths and unsafe names', () => {
  for (const name of ['../a.png', ['C:', 'photo.png'].join('\\'), '%00a.png', '..']) assert.throws(() => safeFilename(name));
  assert.equal(safeFilename('photo%20one.png'), 'photo one.png');
  for (const key of ['../a', `${site}/../a`, `${site}/${site}/../../secret`, `${site}/${site}/full.svg`]) assert.throws(() => assetPath('/private-assets', key));
});
test('bounded stream rejects oversize while reading, including missing content-length', async () => {
  let reads = 0;
  const stream = new ReadableStream({ pull(c) { reads++; c.enqueue(new Uint8Array(8)); } });
  await assert.rejects(boundedBody(new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' }), 10), /UPLOAD_TOO_LARGE/);
  assert.ok(reads <= 3);
  await assert.rejects(boundedBody(new Request('http://localhost', { method: 'POST', headers: { 'content-length': String(MAX_UPLOAD_BYTES + 1) }, body: 'x' })), /UPLOAD_TOO_LARGE/);
});
test('photo processing keeps original, matches variants, same-Site deduplicates, cleans only new directory on DB failure', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'site-assets-unit-')); const old = process.env.FRAME_ZERO_SITE_ASSET_ROOT;
  process.env.FRAME_ZERO_SITE_ASSET_ROOT = root;
  const rows = [];
  const db = { async query(sql, values) {
    if (sql.startsWith('SELECT')) { const found = rows.filter(r => r.site_id === values[0] && r.digest === values[1]); return { rows: found, rowCount: found.length }; }
    const [id, site_id, digest, original_type, width, height, variants] = values;
    const row = { id, site_id, digest, original_type, width, height, variants: JSON.parse(variants) }; rows.push(row); return { rows: [row], rowCount: 1 };
  } };
  const input = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#456789' } }).png().toBuffer();
  const request = bytes => new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'image/png', 'x-file-name': 'anonymous.png' }, body: bytes });
  try {
    const first = await uploadAsset(request(input), db, site); assert.equal(first.created, true);
    assert.deepEqual(await readFile(assetPath(root, first.row.variants.original.key)), input);
    const dto = assetDto(first.row, 'photographer'); assert.equal(dto.orientation, 'landscape'); assert.ok(dto.variants.full.src.startsWith('/api/sites/photographer/assets/')); assert.equal(JSON.stringify(dto).includes(root), false);
    assert.equal((await uploadAsset(request(input), db, site)).created, false);
    assert.equal((await readdir(path.join(root, site))).length, 1);
    await assert.rejects(uploadAsset(request(Buffer.from('corrupt')), db, site), /INVALID_IMAGE/);
    const strip = await sharp({ create: { width: 1000, height: 20, channels: 3, background: '#456789' } }).png().toBuffer();
    await assert.rejects(uploadAsset(request(strip), db, site), /UNSUPPORTED_IMAGE_RATIO/);
    assert.equal((await readdir(path.join(root, site))).length, 1);
    const other = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#789abc' } }).png().toBuffer();
    const failing = { async query(sql) { if (sql.startsWith('SELECT')) return { rowCount: 0, rows: [] }; throw new Error('injected insert failure'); } };
    await assert.rejects(uploadAsset(request(other), failing, site), /injected/);
    assert.equal((await readdir(path.join(root, site))).length, 1);
  } finally { if (old === undefined) delete process.env.FRAME_ZERO_SITE_ASSET_ROOT; else process.env.FRAME_ZERO_SITE_ASSET_ROOT = old; await rm(root, { recursive: true, force: true }); }
});

test('cleanup failure releases every processing slot and exposes only a fixed storage error', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'site-assets-cleanup-')); const old = process.env.FRAME_ZERO_SITE_ASSET_ROOT;
  process.env.FRAME_ZERO_SITE_ASSET_ROOT = root;
  const errors = [];
  t.mock.method(console, 'error', value => errors.push(value));
  const input = await sharp({ create: { width: 24, height: 32, channels: 3, background: '#234567' } }).png().toBuffer();
  const request = () => new Request('http://fixture', { method: 'POST', headers: { 'content-type': 'image/png', 'x-file-name': 'fixture.png' }, body: input });
  let inserts = 0;
  const failing = { async query(sql) { if (sql.startsWith('SELECT')) return { rowCount: 0, rows: [] }; inserts++; throw Error('private insert details'); } };
  const cleanupDirectory = async () => { throw Error('/private/storage locked'); };
  try {
    for (let index = 0; index < 3; index++) {
      await assert.rejects(uploadAsset(request(), failing, site, { cleanupDirectory }), error => error.message === 'ASSET_STORAGE_UNAVAILABLE' && error.status === 503);
    }
    assert.equal(inserts, 3, 'Third request reaches processing instead of remaining stuck at UPLOAD_BUSY');
    assert.deepEqual(errors, ['ASSET_UPLOAD_CLEANUP_FAILED', 'ASSET_UPLOAD_CLEANUP_FAILED', 'ASSET_UPLOAD_CLEANUP_FAILED']);
    assert.equal((await readdir(path.join(root, site))).length, 3, 'Failed cleanup is not treated as successful deletion');
    await assert.rejects(uploadAsset(request(), failing, site), /private insert details/, 'Ordinary subsequent processing and cleanup still work');
  } finally { if (old === undefined) delete process.env.FRAME_ZERO_SITE_ASSET_ROOT; else process.env.FRAME_ZERO_SITE_ASSET_ROOT = old; await rm(root, { recursive: true, force: true }); }
});

test('interrupted upload streams return a fixed error without consuming processing capacity', async () => {
  for (let index = 0; index < 3; index++) {
    const body = new ReadableStream({ start(controller) { controller.error(Error('/private/upload socket')); } });
    const request = new Request('http://fixture', { method: 'POST', duplex: 'half', headers: { 'content-type': 'image/png', 'x-file-name': 'fixture.png' }, body });
    await assert.rejects(uploadAsset(request, { async query() { throw Error('must not query'); } }, site), error => error.message === 'UPLOAD_INTERRUPTED' && error.status === 400);
  }
});

test('only two uploads can read concurrently and abort releases both slots', async () => {
  const controllers = [new AbortController(), new AbortController()];
  const db = { async query() { return { rowCount: 0, rows: [] }; } };
  const pending = controllers.map(controller => uploadAsset(new Request('http://fixture', {
    method: 'POST', duplex: 'half', signal: controller.signal,
    headers: { 'content-type': 'image/png', 'x-file-name': 'fixture.png' },
    body: new ReadableStream({ pull() { return new Promise(() => {}); } }),
  }), db, site));
  const request = () => new Request('http://fixture', { method: 'POST', headers: { 'content-type': 'image/png', 'x-file-name': 'fixture.png' }, body: 'not an image' });
  await assert.rejects(uploadAsset(request(), db, site), error => error.status === 429 && error.message === 'UPLOAD_BUSY');
  controllers.forEach(controller => controller.abort());
  const results = await Promise.allSettled(pending);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.message === 'UPLOAD_INTERRUPTED'));
  await assert.rejects(uploadAsset(request(), db, site), /INVALID_IMAGE/, 'A new request proceeds after cancellation instead of 429');
});

test('deduplication race cleanup runs once and returns its processing slot on cleanup failure', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'site-assets-dedup-cleanup-')); const old = process.env.FRAME_ZERO_SITE_ASSET_ROOT;
  process.env.FRAME_ZERO_SITE_ASSET_ROOT = root;
  t.mock.method(console, 'error', () => {});
  let reads = 0, cleanups = 0;
  const db = { async query(sql) {
    if (sql.startsWith('INSERT')) return { rowCount: 0, rows: [] };
    reads++;
    return reads % 2 === 1 ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ id: site }] };
  } };
  const input = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#789abc' } }).png().toBuffer();
  const request = () => new Request('http://fixture', { method: 'POST', headers: { 'content-type': 'image/png', 'x-file-name': 'fixture.png' }, body: input });
  const cleanupDirectory = async () => { cleanups++; throw Error('private cleanup failure'); };
  try {
    for (let index = 0; index < 3; index++) await assert.rejects(uploadAsset(request(), db, site, { cleanupDirectory }), /ASSET_STORAGE_UNAVAILABLE/);
    assert.equal(cleanups, 3, 'Each duplicate candidate cleanup is attempted once');
    assert.equal(reads, 6, 'All three candidates reach the deduplication race instead of getting stuck at 429');
  } finally { if (old === undefined) delete process.env.FRAME_ZERO_SITE_ASSET_ROOT; else process.env.FRAME_ZERO_SITE_ASSET_ROOT = old; await rm(root, { recursive: true, force: true }); }
});

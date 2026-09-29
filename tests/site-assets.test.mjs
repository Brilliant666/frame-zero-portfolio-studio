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

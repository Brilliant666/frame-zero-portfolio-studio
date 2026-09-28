import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const policy = { thumbnail: [480, 60], card: [1100, 70], full: [2200, 80] };
export class AssetError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export function assetRoot() {
  const root = process.env.FRAME_ZERO_SITE_ASSET_ROOT;
  if (!root || !path.isAbsolute(root) || /(?:^|[\\/])(?:public|dist|\.next|\.next-account)(?:[\\/]|$)/i.test(root)) throw new AssetError('ASSET_STORAGE_UNAVAILABLE', 503);
  return path.resolve(root);
}
export function assetPath(root, key) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(original\.(?:jpeg|png|webp)|(?:thumbnail|card|full)\.(?:webp|png|jpeg|jpg))$/i.test(key)) throw new AssetError('INVALID_STORAGE_KEY');
  const [site, id] = key.split('/');
  if (!UUID.test(site) || !UUID.test(id)) throw new AssetError('INVALID_STORAGE_KEY');
  return path.join(root, ...key.split('/'));
}
export function safeFilename(value) {
  let name;
  try { name = decodeURIComponent(value ?? ''); } catch { throw new AssetError('INVALID_FILENAME'); }
  if (!name || name.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(name) || name === '.' || name === '..') throw new AssetError('INVALID_FILENAME');
  return name;
}
export async function boundedBody(request, maximum = MAX_UPLOAD_BYTES) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new AssetError('UPLOAD_TOO_LARGE', 413);
  if (!request.body) throw new AssetError('EMPTY_UPLOAD');
  const reader = request.body.getReader(); const parts = []; let size = 0;
  let expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 30_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expired) throw new AssetError('UPLOAD_TIMEOUT', 408);
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new AssetError('UPLOAD_TOO_LARGE', 413); }
      parts.push(Buffer.from(value));
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  if (!size) throw new AssetError('EMPTY_UPLOAD');
  return Buffer.concat(parts, size);
}
export function assetDto(row, slug) {
  return { id: row.id, aspectRatio: row.width / row.height, orientation: row.width === row.height ? 'square' : row.width > row.height ? 'landscape' : 'portrait', variants: Object.fromEntries(Object.keys(policy).map(name => {
    const v = row.variants[name];
    return [name, { src: `/api/sites/${encodeURIComponent(slug)}/assets/${row.id}/${name}`, width: v.width, height: v.height, bytes: v.bytes }];
  })) };
}
// Admission time belongs to the authenticated Site library, not public rendering.
export function siteAssetDto(row, slug) {
  return { ...assetDto(row, slug), ...(row.created_at == null ? {} : { createdAt: new Date(row.created_at).toISOString() }) };
}
export async function insertPreparedAsset(db, asset) {
  const result = await db.query(`INSERT INTO site_assets(id,site_id,digest,original_type,width,height,variants)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(site_id,digest) DO NOTHING RETURNING *`,
    [asset.id, asset.siteId, asset.digest, asset.originalType, asset.width, asset.height, JSON.stringify(asset.variants)]);
  if (result.rowCount) return { row: result.rows[0], created: true };
  const existing = await db.query('SELECT * FROM site_assets WHERE site_id=$1 AND digest=$2', [asset.siteId, asset.digest]);
  return { row: existing.rows[0], created: false };
}
let processing = 0;
export async function uploadAsset(request, db, siteId) {
  if (processing >= 2) throw new AssetError('UPLOAD_BUSY', 429);
  safeFilename(request.headers.get('x-file-name'));
  const type = request.headers.get('content-type');
  if (!Object.values(formats).includes(type)) throw new AssetError('UNSUPPORTED_IMAGE', 415);
  processing++;
  let directory;
  try {
    const bytes = await boundedBody(request);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const existing = await db.query('SELECT * FROM site_assets WHERE site_id=$1 AND digest=$2', [siteId, digest]);
    if (existing.rowCount) return { row: existing.rows[0], created: false };
    let metadata;
    try { metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' }).metadata(); }
    catch { throw new AssetError('INVALID_IMAGE'); }
    if (!formats[metadata.format] || formats[metadata.format] !== type || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width > 20000 || metadata.height > 20000 || metadata.width * metadata.height > MAX_PIXELS) throw new AssetError('INVALID_IMAGE');
    const ratio = metadata.width / metadata.height;
    if (ratio < .05 || ratio > 20) throw new AssetError('UNSUPPORTED_IMAGE_RATIO');
    const id = randomUUID(); const root = assetRoot();
    directory = path.dirname(assetPath(root, `${siteId}/${id}/original.${metadata.format}`));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const variants = {};
    const originalKey = `${siteId}/${id}/original.${metadata.format}`;
    const original = await open(assetPath(root, originalKey), 'wx', 0o600);
    try { await original.writeFile(bytes); } finally { await original.close(); }
    variants.original = { key: originalKey, width: metadata.width, height: metadata.height, bytes: bytes.length, type };
    for (const [name, [maximum, quality]] of Object.entries(policy)) {
      let output;
      try { output = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' }).timeout({ seconds: 15 }).rotate().resize({ width: maximum, height: maximum, fit: 'inside', withoutEnlargement: true }).webp({ quality, effort: 4, smartSubsample: true }).toBuffer({ resolveWithObject: true }); }
      catch { throw new AssetError('INVALID_IMAGE'); }
      const key = `${siteId}/${id}/${name}.webp`; const file = await open(assetPath(root, key), 'wx', 0o600);
      try { await file.writeFile(output.data); } finally { await file.close(); }
      variants[name] = { key, width: output.info.width, height: output.info.height, bytes: output.data.length, type: 'image/webp' };
    }
    const result = await insertPreparedAsset(db, { id, siteId, digest, originalType: type, width: variants.full.width, height: variants.full.height, variants });
    if (!result.created) await rm(directory, { recursive: true, force: true });
    directory = null;
    return result;
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    processing--;
  }
}
export async function readAssetVariant(row, variant, root = assetRoot()) {
  if (!['original', ...Object.keys(policy)].includes(variant) || !row.variants[variant]) throw new AssetError('NOT_FOUND', 404);
  const data = row.variants[variant]; const filename = assetPath(root, data.key);
  const canonicalRoot = await realpath(root); const canonical = await realpath(filename);
  if (!canonical.startsWith(`${canonicalRoot}${path.sep}`)) throw new AssetError('NOT_FOUND', 404);
  return { bytes: await readFile(canonical), type: data.type };
}

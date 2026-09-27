import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Anonymous generated pixels only. Never discovers or reads a user's photo root.
export async function createLegacyImportFixture(root) {
  const photosRoot = path.join(root, 'photos'), qrRoot = path.join(root, 'qr');
  await mkdir(path.join(photosRoot, 'library'), { recursive: true }); await mkdir(qrRoot);
  const source = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#4488bb' } }).webp().toBuffer();
  await writeFile(path.join(photosRoot, 'library', 'anonymous.webp'), source);
  const variant = { src: '/photos/library/anonymous.webp', width: 60, height: 40, bytes: source.length };
  const manifest = { version: 1, assets: [{ id: 'anonymous-photo', orientation: 'landscape', aspectRatio: 1.5, variants: { thumbnail: variant, card: variant, full: variant } }] };
  await writeFile(path.join(photosRoot, 'library-manifest.json'), JSON.stringify(manifest));
  const qr = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#bbccee' } }).png().toBuffer();
  const qrId = createHash('sha256').update(qr).digest('hex'); await writeFile(path.join(qrRoot, `${qrId}.png`), qr);
  const basics = { profile: { brand: '', mark: '', photographer: 'Basic fixture', role: '', city: '', availability: '', intro: '' }, hero: { eyebrow: '', title: '', services: '' }, contact: { wechat: '', email: '', note: '' }, statement: { eyebrow: '', lineOne: '', lineTwo: '' }, trustItems: [], packages: [], social: [{ label: 'Anonymous platform', handle: 'fixture', qrAssetId: qrId }], bookingFields: [] };
  const work = { assetId: 'anonymous-photo', slotIndex: 0, locked: true, code: 'A', title: 'Kept title', subtitle: '', image: variant.src, preview: variant.src, position: '30% 70%', previewWidth: 60, previewHeight: 40, fullWidth: 60, enabled: true };
  const basic = { ...basics, activeTemplate: 'cinematic-light', works: [work], templateWorks: { 'cinematic-light': [work] } };
  const premium = { ...structuredClone(basics), schemaVersion: 1, collections: [{ id: randomUUID(), name: 'Kept collection', description: 'Kept description', visible: true, coverAssetId: 'anonymous-photo', focusAssetId: 'anonymous-photo', assetIds: ['anonymous-photo'], coverFit: 'fill', coverFocusX: 31, coverFocusY: 72 }] };
  premium.profile.photographer = 'Premium fixture';
  const sqlitePath = path.join(root, 'source.sqlite'); const db = new DatabaseSync(sqlitePath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE site_settings(id INTEGER PRIMARY KEY,content TEXT NOT NULL,updated_at TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO site_settings VALUES(?,?,?)');
  insert.run(1, JSON.stringify(basic), '2026-01-01'); insert.run(2601, JSON.stringify({ content: premium, revision: 7 }), '2026-01-02');
  return { sqlitePath, photosRoot, qrRoot, db, basic, premium };
}

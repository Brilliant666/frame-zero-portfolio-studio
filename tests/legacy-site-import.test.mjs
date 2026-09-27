import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createLegacyImportFixture } from './fixtures/legacy-import-fixture.mjs';
import { exportLegacySnapshot, planLegacyImport, applyLegacyImport, verifyLegacySourceUnchanged, preflightLegacyImport, planFingerprint } from '../db/accounts/legacy-import.mjs';
import { loadSiteContentSchema } from '../scripts/lib/load-site-schema.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'legacy-import-fixture-'));
  const source = await createLegacyImportFixture(root);
  t.after(async () => { source.db.close(); await rm(root, { recursive: true, force: true }); });
  const outputDirectory = path.join(root, 'backup');
  const snapshot = await exportLegacySnapshot({ ...source, outputDirectory });
  return { root, source, snapshot, outputDirectory };
}
test('Node 22.13-compatible VACUUM snapshot captures WAL and independent records plus byte-identical cards', async t => {
  const { source, snapshot, outputDirectory } = await fixture(t);
  assert.equal(snapshot.records.basic.content.profile.photographer, 'Basic fixture');
  assert.equal(snapshot.records['premium-polaroid'].content.profile.photographer, 'Premium fixture');
  assert.equal(snapshot.records['premium-polaroid'].revision, 7);
  const backup = new DatabaseSync(path.join(outputDirectory, 'source.sqlite'), { readOnly: true });
  assert.deepEqual(backup.prepare('SELECT * FROM site_settings ORDER BY id').all(), source.db.prepare('SELECT * FROM site_settings ORDER BY id').all()); backup.close();
  assert.equal(snapshot.assets.length, 2);
  assert.equal(snapshot.assets[0].provenance, 'legacy-derived-only');
  assert.equal(snapshot.assets[0].variants.original, undefined);
  assert.deepEqual(await readFile(path.join(outputDirectory, snapshot.assets[0].variants.full.file)), await readFile(path.join(source.photosRoot, 'library', 'anonymous.webp')));
});
test('mapping preserves collection identity order settings and independent business content', async t => {
  const { snapshot, source } = await fixture(t);
  const plan = planLegacyImport({ snapshot, siteId: randomUUID(), siteSlug: 'fixture-owner' });
  const schema = await loadSiteContentSchema();
  try { for (const [space, content] of Object.entries(plan.contents)) assert.deepEqual(schema.parseSpaceContent(space, content), content); }
  finally { await schema.dispose(); }
  const c = plan.contents['premium-polaroid'].collections[0];
  assert.equal(c.id, source.premium.collections[0].id); assert.equal(c.coverFocusX, 31); assert.equal(c.coverFit, 'fill');
  assert.equal(c.assetIds[0], plan.mapping['photo:anonymous-photo']); assert.equal(c.coverAssetId, c.focusAssetId);
  assert.equal(plan.contents.basic.works[0].position, '30% 70%');
  assert.equal(plan.contents.basic.social[0].qrAssetId, plan.contents['premium-polaroid'].social[0].qrAssetId);
  assert.deepEqual(planLegacyImport({ snapshot, siteId: plan.siteId, siteSlug: plan.siteSlug, previousPlan: plan }), plan);
  assert.throws(() => planLegacyImport({ snapshot, siteId: randomUUID(), siteSlug: plan.siteSlug, previousPlan: plan }), /CONFLICT/);
  assert.throws(() => planLegacyImport({ snapshot: { ...snapshot, records: {} }, siteId: plan.siteId, siteSlug: plan.siteSlug }), /CHANGED/);
});
test('occupied target rejects before files or draft writes and rolls back', async t => {
  const { snapshot, outputDirectory, root } = await fixture(t);
  const plan = planLegacyImport({ snapshot, siteId: randomUUID(), siteSlug: 'fixture-owner' });
  const sql = [];
  const client = { async query(q) { sql.push(q); return q.startsWith('SELECT s.id') ? { rowCount: 1, rows: [{ id: plan.siteId }] } : q.includes('FROM site_content_drafts') ? { rowCount: 1, rows: [{}] } : { rowCount: 0, rows: [] }; }, release() {} };
  await assert.rejects(applyLegacyImport({ pool: { connect: async () => client }, plan, snapshotRoot: outputDirectory, privateRoot: path.join(root, 'target'), validateContent: (_space, c) => c }), /TARGET_CONTENT_NOT_EMPTY/);
  assert.equal(sql.at(-1), 'ROLLBACK'); assert.equal(sql.some(q => q.startsWith('INSERT')), false);
});
test('changed source bytes abort before committing target drafts', async t => {
  const { snapshot, outputDirectory, root } = await fixture(t);
  const plan = planLegacyImport({ snapshot, siteId: randomUUID(), siteSlug: 'fixture-owner' });
  await writeFile(path.join(outputDirectory, snapshot.assets[0].variants.full.file), 'corrupted');
  const sql = []; const client = { async query(q) { sql.push(q); return q.startsWith('SELECT s.id') ? { rowCount: 1, rows: [{}] } : { rowCount: 0, rows: [] }; }, release() {} };
  await assert.rejects(applyLegacyImport({ pool: { connect: async () => client }, plan, snapshotRoot: outputDirectory, privateRoot: path.join(root, 'target'), validateContent: (_space, c) => c }), /SNAPSHOT_FILE_CHANGED/);
  assert.equal(sql.at(-1), 'ROLLBACK'); assert.equal(sql.some(q => q.includes('INSERT INTO site_content_drafts')), false);
});
test('source changing after export blocks cutover comparison without modifying backup', async t => {
  const { snapshot, source } = await fixture(t);
  assert.equal(await verifyLegacySourceUnchanged({ ...source, snapshot }), true);
  source.db.prepare('UPDATE site_settings SET updated_at=? WHERE id=2601').run('later-manual-save');
  await assert.rejects(verifyLegacySourceUnchanged({ ...source, snapshot }), /SOURCE_RECORD_CHANGED/);
  assert.equal(snapshot.records['premium-polaroid'].updatedAt, '2026-01-02');
});
test('dry-run validates actual backup files, grant and lossless content adapter', async t => {
  const { snapshot, outputDirectory } = await fixture(t);
  const plan = planLegacyImport({ snapshot, siteId: randomUUID(), siteSlug: 'fixture-owner' });
  const db = { async query(q) { return q.startsWith('SELECT s.id') ? { rowCount: 1, rows: [{}] } : { rowCount: 0, rows: [] }; } };
  const options = { db, plan, snapshotRoot: outputDirectory, validateContent: (_space, c) => c };
  assert.equal((await preflightLegacyImport(options)).alreadyImported, false);
  await assert.rejects(preflightLegacyImport({ ...options, db: { query: async () => ({ rowCount: 0, rows: [] }) } }), /IDENTITY_OR_GRANT/);
  await assert.rejects(preflightLegacyImport({ ...options, validateContent: (_space, c) => ({ ...c, social: [] }) }), /LOSSY_CONTENT_ADAPTER/);
  await rm(path.join(outputDirectory, snapshot.assets[0].variants.full.file));
  await assert.rejects(preflightLegacyImport(options), /ENOENT/);
});
test('tampered valid-fingerprint plans cannot cross Site scope or reference foreign assets', async t => {
  const { snapshot, outputDirectory, root } = await fixture(t);
  const base = planLegacyImport({ snapshot, siteId: randomUUID(), siteSlug: 'fixture-owner' });
  const statements = [];
  const client = { async query(q) { statements.push(q); return q.startsWith('SELECT s.id') ? { rowCount: 1, rows: [{}] } : { rowCount: 0, rows: [] }; }, release() {} };
  for (const [change, error] of [
    [p => { p.assets[0].siteId = randomUUID(); }, /ASSET_SCOPE_MISMATCH/],
    [p => { p.assets[0].variants.full.key = `${randomUUID()}/${p.assets[0].id}/full.webp`; }, /ASSET_KEY_SCOPE_MISMATCH/],
    [p => { p.contents['premium-polaroid'].collections[0].coverAssetId = randomUUID(); }, /CONTENT_ASSET_NOT_OWNED/],
    [p => { p.contents.basic.social[0].qrAssetId = randomUUID(); }, /CONTENT_ASSET_NOT_OWNED/],
    [p => { p.contents.basic.templateWorks['cinematic-light'][0].assetId = randomUUID(); }, /CONTENT_ASSET_NOT_OWNED/],
  ]) {
    const plan = structuredClone(base); change(plan); plan.fingerprint = planFingerprint(plan);
    await assert.rejects(applyLegacyImport({ pool: { connect: async () => client }, plan, snapshotRoot: outputDirectory, privateRoot: path.join(root, 'target'), validateContent: (_space, c) => c }), error);
  }
  assert.equal(statements.some(q => q.startsWith('INSERT')), false);
});

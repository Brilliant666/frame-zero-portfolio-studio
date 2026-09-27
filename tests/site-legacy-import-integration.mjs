import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { exportLegacySnapshot, planLegacyImport, applyLegacyImport, planFingerprint } from '../db/accounts/legacy-import.mjs';
import { insertPreparedAsset } from '../db/accounts/assets.mjs';
import { loadSiteContentSchema } from '../scripts/lib/load-site-schema.mjs';
import { createLegacyImportFixture } from './fixtures/legacy-import-fixture.mjs';

export async function siteLegacyImportIntegration({ runtime, root, password }) {
  const directory = path.join(root, `migration-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const source = await createLegacyImportFixture(directory);
  const schema = await loadSiteContentSchema();
  try {
    const slug = `migration-${randomUUID().slice(0, 8)}`;
    const target = await provisionAccount(runtime, { username: slug, slug, email: `${slug}@example.invalid`, password: password ?? `Fixture-${randomUUID()}`, premium: true });
    const snapshotRoot = path.join(directory, 'backup');
    const snapshot = await exportLegacySnapshot({ ...source, outputDirectory: snapshotRoot });
    const plan = planLegacyImport({ snapshot, siteId: target.siteId, siteSlug: slug });
    const options = { pool: runtime.pool, plan, snapshotRoot, privateRoot: path.join(directory, 'private-assets'), validateContent: schema.parseSpaceContent };
    const originalRows = source.db.prepare('SELECT * FROM site_settings ORDER BY id').all();
    const otherSlug = `other-${randomUUID().slice(0, 8)}`;
    const other = await provisionAccount(runtime, { username: otherSlug, slug: otherSlug, email: `${otherSlug}@example.invalid`, password: password ?? `Fixture-${randomUUID()}`, premium: true });
    const foreignId = randomUUID();
    const foreignVariants = Object.fromEntries(Object.entries(plan.assets[0].variants).map(([name, v]) => [name, { ...v, key: `${other.siteId}/${foreignId}/${name}.webp` }]));
    await insertPreparedAsset(runtime.pool, { ...plan.assets[0], id: foreignId, siteId: other.siteId, variants: foreignVariants });
    const forged = structuredClone(plan);
    forged.contents['premium-polaroid'].collections[0].coverAssetId = foreignId;
    forged.fingerprint = planFingerprint(forged);
    await assert.rejects(applyLegacyImport({ ...options, plan: forged }), /CONTENT_ASSET_NOT_OWNED/);
    assert.equal((await runtime.pool.query('SELECT * FROM site_content_drafts WHERE site_id=$1', [target.siteId])).rowCount, 0);
    // Inject a database failure after all copies/asset rows and draft writes.
    // A real PostgreSQL rollback must remove every target reference, while the
    // fully prepared files remain byte-verifiable for exact-plan recovery.
    const failingPool = { async connect() {
      const client = await runtime.pool.connect();
      return { async query(sql, values) { if (sql.startsWith('INSERT INTO site_legacy_imports')) throw new Error('INJECTED_RECEIPT_FAILURE'); return client.query(sql, values); }, release() { client.release(); } };
    } };
    await assert.rejects(applyLegacyImport({ ...options, pool: failingPool }), /INJECTED_RECEIPT_FAILURE/);
    assert.equal((await runtime.pool.query('SELECT * FROM site_content_drafts WHERE site_id=$1', [target.siteId])).rowCount, 0);
    assert.equal((await runtime.pool.query('SELECT * FROM site_assets WHERE site_id=$1', [target.siteId])).rowCount, 0);
    assert.deepEqual(source.db.prepare('SELECT * FROM site_settings ORDER BY id').all(), originalRows);
    assert.equal((await applyLegacyImport(options)).status, 'IMPORTED');
    assert.equal((await applyLegacyImport(options)).status, 'ALREADY_IMPORTED');
    const drafts = (await runtime.pool.query('SELECT space,revision,content FROM site_content_drafts WHERE site_id=$1 ORDER BY space', [target.siteId])).rows;
    assert.equal(drafts.length, 2); assert.ok(drafts.every(d => d.revision === 1));
    const basic = drafts.find(d => d.space === 'basic').content, premium = drafts.find(d => d.space === 'premium-polaroid').content;
    assert.equal(basic.profile.photographer, 'Basic fixture'); assert.equal(premium.profile.photographer, 'Premium fixture');
    assert.equal(basic.works[0].assetId, premium.collections[0].assetIds[0]);
    assert.equal(premium.collections[0].id, source.premium.collections[0].id);
    assert.equal(premium.collections[0].coverFocusX, 31); assert.equal(premium.collections[0].coverFocusY, 72);
    assert.equal(basic.social[0].qrAssetId, premium.social[0].qrAssetId);
    const assets = (await runtime.pool.query('SELECT * FROM site_assets WHERE site_id=$1', [target.siteId])).rows;
    assert.equal(assets.length, 2);
    for (const asset of assets) for (const [name, variant] of Object.entries(asset.variants)) {
      const expected = plan.assets.find(a => a.id === asset.id).sourceVariants[name];
      assert.deepEqual(await readFile(path.join(options.privateRoot, variant.key)), await readFile(path.join(snapshotRoot, expected.file)));
    }
    // Completion does not grant authority to overwrite later manual edits.
    await runtime.pool.query("UPDATE site_content_drafts SET revision=2,content=jsonb_set(content,'{profile,photographer}','\"Later manual edit\"'::jsonb) WHERE site_id=$1 AND space='basic'", [target.siteId]);
    assert.equal((await applyLegacyImport(options)).status, 'ALREADY_IMPORTED');
    assert.equal((await runtime.pool.query("SELECT content FROM site_content_drafts WHERE site_id=$1 AND space='basic'", [target.siteId])).rows[0].content.profile.photographer, 'Later manual edit');
    const differentPlan = planLegacyImport({ snapshot, siteId: target.siteId, siteSlug: slug });
    await assert.rejects(applyLegacyImport({ ...options, plan: differentPlan }), /TARGET_CONTENT_NOT_EMPTY/);
    assert.deepEqual(source.db.prepare('SELECT * FROM site_settings ORDER BY id').all(), originalRows);
  } finally { await schema.dispose(); source.db.close(); }
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import ts from 'typescript';
import { readAccountConfig } from '../scripts/lib/account-config.mjs';
import { changePublication, publicationHistory, prunePublicationHistory } from '../db/accounts/publications.mjs';
import { basicPublicationDatabaseIntegration } from './basic-publication-database-integration.mjs';
import { flowGalleryDatabaseIntegration } from './flow-gallery-database-integration.mjs';

async function loadProjection(directory) {
  const modules = { catalog: 'templates/catalog.ts', policy: 'photo-ratio-policy.ts', orientation: 'templates/shared/source-orientation-layout.ts', slots: 'templates/shared/photo-slots.tsx', fallback: 'templates/shared/template-work-fallback.ts', document: 'preview-workspace/document.ts', flow: 'site-editor/flow-gallery-document.ts', schema: 'site-editor/content-schema.ts', projection: 'site-editor/publication-projection.ts' };
  const imports = { '../catalog': 'catalog', '../templates/catalog': 'catalog', '../site-config': 'catalog', '../../photo-ratio-policy': 'policy', './source-orientation-layout': 'orientation', './photo-slots': 'slots', './photo-slots.module.css': 'styles', '../templates/shared/photo-slots': 'slots', '../templates/shared/template-work-fallback': 'fallback', '../preview-workspace/document': 'document', './flow-gallery-document': 'flow', './content-schema': 'schema', 'react/jsx-runtime': 'jsx' };
  await fs.writeFile(path.join(directory, 'styles.mjs'), 'export default {};');
  await fs.writeFile(path.join(directory, 'jsx.mjs'), 'export const jsx=()=>null;export const jsxs=jsx;export const Fragment=Symbol();');
  for (const [name, source] of Object.entries(modules)) {
    let code = ts.transpileModule(await fs.readFile(new URL(`../app/${source}`, import.meta.url), 'utf8'), { fileName: source, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    for (const [from, to] of Object.entries(imports)) code = code.replaceAll(`from "${from}"`, `from "./${to}.mjs"`);
    await fs.writeFile(path.join(directory, `${name}.mjs`), code);
  }
  const load = name => import(pathToFileURL(path.join(directory, `${name}.mjs`)).href);
  return { ...await load('projection'), ...await load('schema'), ...await load('flow') };
}

// All writes are confined to a freshly generated schema. Never reset/truncate an
// existing test fixture, and refuse the daily database even with valid credentials.
export async function publicationRetentionDatabaseIntegration({ runtime }) {
  const client = await runtime.pool.connect();
  const schema = `retention_${randomUUID().replaceAll('-', '')}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-retention-'));
  let created = false;
  try {
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
    await client.query(`CREATE SCHEMA "${schema}"`); created = true;
    await client.query(`SET search_path TO "${schema}"`);
    for (const file of ['0000_sparkling_magma', '0001_awesome_phil_sheldon', '0002_site_assets', '0003_site_publications', '0004_basic_publications', '0005_flow_gallery_space']) {
      const sql = await fs.readFile(new URL(`../drizzle-accounts/${file}.sql`, import.meta.url), 'utf8');
      await client.query(sql.replaceAll('"public".', `"${schema}".`));
    }
    const pool = { query: (...args) => client.query(...args), connect: async () => ({ query: (...args) => client.query(...args), release() {} }) };
    const newSite = async name => {
      const userId = randomUUID(), ownerId = randomUUID(), siteId = randomUUID(), intent = randomUUID();
      await client.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [userId, name, `${name}@example.invalid`]);
      await client.query('INSERT INTO account_provisioning(id,username,email,slug,completed_at) VALUES($1,$2,$3,$2,now())', [intent, name, `${name}@example.invalid`]);
      await client.query('INSERT INTO portfolio_users(id,auth_user_id,provisioning_id) VALUES($1,$2,$3)', [ownerId, userId, intent]);
      await client.query('INSERT INTO sites(id,slug,owner_id) VALUES($1,$2,$3)', [siteId, name, ownerId]);
      return { siteId, userId };
    };
    const insert = async (siteId, space, n, { content = { marker: n }, assetIds = [], time = n } = {}) => (await client.query('INSERT INTO site_publication_revisions(site_id,space,draft_revision,content,asset_ids,published_at) VALUES($1,$2,$3,$4::jsonb,$5::uuid[], $6::timestamptz) RETURNING *', [siteId, space, n + 1, JSON.stringify(content), assetIds, new Date(Date.UTC(2026, 0, 1, 0, time)).toISOString()])).rows[0];
    const rows = async siteId => (await client.query('SELECT * FROM site_publication_revisions WHERE site_id=$1 ORDER BY space,published_at,id', [siteId])).rows;
    const pointer = async siteId => (await client.query('SELECT revision_id FROM site_publications WHERE site_id=$1', [siteId])).rows[0]?.revision_id ?? null;
    const setPointer = (siteId, id) => client.query('INSERT INTO site_publications(site_id,revision_id) VALUES($1,$2) ON CONFLICT(site_id) DO UPDATE SET revision_id=EXCLUDED.revision_id', [siteId, id]);
    const a = await newSite('retentiona'), b = await newSite('retentionb');
    const initial = [];
    for (let n = 0; n < 13; n++) initial.push(await insert(a.siteId, 'basic', n));
    await setPointer(a.siteId, initial[0].id);
    // A recent duplicate does not rewrite the old current snapshot's timestamp.
    await insert(a.siteId, 'basic', 0, { time: 100 });
    await insert(a.siteId, 'basic', 12, { time: 101 });
    for (let n = 0; n < 12; n++) await insert(a.siteId, 'premium-polaroid', n);
    const bSnapshot = await insert(b.siteId, 'basic', 0);
    await setPointer(b.siteId, bSnapshot.id);
    const before = await rows(a.siteId), beforeB = await rows(b.siteId);
    const migration = await fs.readFile(new URL('../drizzle-accounts/0006_publication_history_retention.sql', import.meta.url), 'utf8');
    await client.query(migration); await client.query(migration);
    assert.deepEqual(await rows(a.siteId), before, 'migration installs policy without cleanup');
    assert.equal(await pointer(a.siteId), initial[0].id);
    assert.equal(await prunePublicationHistory(client, a.siteId), 6);
    const after = await rows(a.siteId), basic = after.filter(row => row.space === 'basic');
    assert.deepEqual(basic.map(row => row.content.marker), [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.deepEqual(basic[0], initial[0], 'old current remains byte-for-byte immutable plus ten newer distinct versions');
    assert.equal(after.filter(row => row.space === 'premium-polaroid').length, 10);
    assert.equal(await prunePublicationHistory(client, a.siteId), 0, 'cleanup is idempotent');
    assert.deepEqual(await rows(b.siteId), beforeB, 'Site scope never crosses ownership boundary');
    await assert.rejects(client.query('UPDATE site_publication_revisions SET content=content WHERE id=$1', [initial[0].id]), /immutable/);
    await assert.rejects(client.query('DELETE FROM site_publication_revisions WHERE id=$1', [initial[0].id]), /immutable/);
    await client.query('SELECT set_config(\'portfolio.publication_retention_site\',$1,false)', [a.siteId]);
    for (const row of [initial[0], basic[1]]) await assert.rejects(client.query('DELETE FROM site_publication_revisions WHERE id=$1', [row.id]), /immutable/, 'forging the scope cannot delete current or retained rows');
    await client.query("RESET portfolio.publication_retention_site");
    await assert.rejects(setPointer(a.siteId, bSnapshot.id), /foreign key/);

    const assetA = randomUUID(), assetB = randomUUID();
    await insert(b.siteId, 'premium-polaroid', 1, { content: { same: true }, assetIds: [assetA, assetB] });
    const latestSet = await insert(b.siteId, 'premium-polaroid', 2, { content: { same: true }, assetIds: [assetB, assetA, assetA] });
    const differentSet = await insert(b.siteId, 'premium-polaroid', 3, { content: { same: true }, assetIds: [assetA] });
    assert.equal(await prunePublicationHistory(client, b.siteId, 'premium-polaroid'), 1);
    assert.deepEqual((await rows(b.siteId)).filter(row => row.space === 'premium-polaroid').map(row => row.id), [latestSet.id, differentSet.id], 'asset ids compare as sets');

    const m = await loadProjection(directory), c = await newSite('retentionpublish'), flow = 'premium-flow-gallery';
    await client.query('INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,$3,\'operator-test\')', [randomUUID(), c.siteId, flow]);
    const draft = m.createEmptyFlowGalleryDocument();
    draft.profile.title = 'Visible title';
    draft.groups = [{ id: randomUUID(), name: 'Hidden draft only', assetIds: [], captions: {}, visible: false }];
    const save = (space, revision, content) => client.query('INSERT INTO site_content_drafts(site_id,space,revision,content) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(site_id,space) DO UPDATE SET revision=EXCLUDED.revision,content=EXCLUDED.content', [c.siteId, space, revision, JSON.stringify(content)]);
    const publish = async (space, revision, actor = c.userId) => changePublication(pool, { ...c, userId: actor, space, payload: { action: 'publish', expectedDraftRevision: revision, expectedPublicationId: await pointer(c.siteId) }, prepare: value => m.preparePublication(value, space) });
    const rollback = async (space, revisionId) => changePublication(pool, { ...c, space, payload: { action: 'rollback', revisionId, expectedPublicationId: await pointer(c.siteId) }, prepare: value => m.preparePublication(value, space) });
    await save(flow, 1, draft);
    const first = await publish(flow, 1);
    assert.equal(first.outcome, 'created'); assert.equal(first.matchedDraftRevision, 1);
    const original = (await rows(c.siteId))[0];
    const pointerVersion = (await client.query('SELECT xmin::text AS version FROM site_publications WHERE site_id=$1', [c.siteId])).rows[0].version;
    assert.equal((await publish(flow, 1)).outcome, 'unchanged');
    draft.groups[0].name = 'Hidden name changed';
    await save(flow, 2, draft);
    const unchanged = await publish(flow, 2);
    assert.equal(unchanged.id, first.id); assert.equal(unchanged.outcome, 'unchanged');
    assert.equal(unchanged.draftRevision, 1); assert.equal(unchanged.matchedDraftRevision, 2);
    assert.deepEqual((await rows(c.siteId))[0], original);
    assert.equal((await client.query('SELECT xmin::text AS version FROM site_publications WHERE site_id=$1', [c.siteId])).rows[0].version, pointerVersion, 'same content leaves Published pointer untouched');
    const historyOptions = { authorizedSpaces: [flow], prepare: m.preparePublication };
    assert.equal((await publicationHistory(pool, c.siteId, historyOptions)).current.matchedDraftRevision, 2);
    draft.profile.title = 'Different visible title'; await save(flow, 3, draft);
    assert.equal((await publicationHistory(pool, c.siteId, historyOptions)).current.matchedDraftRevision, null);
    const second = await publish(flow, 3); assert.equal(second.outcome, 'created'); assert.notEqual(second.id, first.id);
    draft.profile.title = 'Visible title'; await save(flow, 4, draft);
    const reused = await publish(flow, 4);
    assert.equal(reused.id, first.id); assert.equal(reused.outcome, 'reused');
    assert.equal(reused.draftRevision, 1); assert.equal(reused.matchedDraftRevision, 4);
    const basicDraft = m.createEmptyBasicContent(); await save('basic', 1, basicDraft);
    const basicPublished = await publish('basic', 1); assert.notEqual(basicPublished.id, first.id);
    assert.equal((await publish(flow, 4)).outcome, 'reused', 'switching content spaces may reuse the old immutable snapshot');
    await assert.rejects(publish(flow, 4, b.userId), error => error.status === 403);
    await assert.rejects(rollback(flow, bSnapshot.id), error => error.status === 404);
    const rolled = await rollback(flow, second.id);
    assert.equal(rolled.matchedDraftRevision, null); assert.equal(rolled.outcome, undefined);
    assert.equal((await rollback(flow, first.id)).matchedDraftRevision, 4);
    for (let n = 5; n <= 18; n++) { draft.profile.title = `Title ${n}`; await save(flow, n, draft); await publish(flow, n); }
    assert.equal((await rows(c.siteId)).filter(row => row.space === flow).length, 10, 'every publish bounds its own space');
    await assert.rejects(rollback(flow, first.id), error => error.status === 404, 'pruned version cannot be rolled back');
    const retained = (await rows(c.siteId)).filter(row => row.space === flow)[0];
    assert.equal((await rollback(flow, retained.id)).id, retained.id);
    // Seed a legacy oversized history, then revoke premium. A permitted basic
    // publish must not prune the other space on behalf of a revoked owner.
    for (let n = 30; n < 34; n++) await insert(c.siteId, flow, n);
    await client.query('DELETE FROM site_template_grants WHERE site_id=$1 AND product=$2', [c.siteId, flow]);
    const revokedBefore = (await rows(c.siteId)).filter(row => row.space === flow);
    await assert.rejects(publish(flow, 18), error => error.status === 403);
    await assert.rejects(rollback(flow, retained.id), error => error.status === 403);
    const revokedHistory = await publicationHistory(pool, c.siteId, historyOptions);
    assert.equal(revokedHistory.current.id, retained.id); assert.equal(revokedHistory.current.matchedDraftRevision, null);
    assert.ok(revokedHistory.history.every(row => row.space === 'basic'));
    await publish('basic', 1);
    assert.deepEqual((await rows(c.siteId)).filter(row => row.space === flow), revokedBefore);
    const draftsBefore = (await client.query('SELECT * FROM site_content_drafts WHERE site_id=$1 ORDER BY space', [c.siteId])).rows;
    const currentBefore = await pointer(c.siteId);
    await prunePublicationHistory(client, c.siteId);
    assert.equal((await rows(c.siteId)).filter(row => row.space === flow).length, 10, 'explicit operator cleanup may cover all Site spaces');
    assert.equal(await pointer(c.siteId), currentBefore);
    assert.deepEqual((await client.query('SELECT * FROM site_content_drafts WHERE site_id=$1 ORDER BY space', [c.siteId])).rows, draftsBefore);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('RESET search_path');
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    assert.ok(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('publication-retention-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const config = readAccountConfig();
  assert.equal(config.isTest, true, 'retention integration requires the dedicated test database');
  const runtime = { pool: new pg.Pool({ connectionString: config.databaseUrl, max: 1 }) };
  try {
    await publicationRetentionDatabaseIntegration({ runtime });
    await basicPublicationDatabaseIntegration({ runtime });
    await flowGalleryDatabaseIntegration({ runtime });
    console.log('Publication retention, basic upgrade and Flow upgrade integration passed (isolated schemas only).');
  } finally { await runtime.pool.end(); }
}

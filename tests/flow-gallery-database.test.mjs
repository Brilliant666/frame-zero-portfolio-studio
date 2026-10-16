import assert from 'node:assert/strict';
import test from 'node:test';
import { changePublication, publicationHistory, readPublished } from '../db/accounts/publications.mjs';
import { flowGalleryWorkspaceCard, publishedWorkspaceSummary, publishedDraftTarget } from '../db/accounts/site-entry.mjs';

const flow = 'premium-flow-gallery';
const polaroid = 'premium-polaroid';
const revision = (space, id) => ({ id, space, content: { activeTemplate: 'film-rail', privateText: 'secret draft content' }, draft_revision: 2, published_at: '2026-09-30T00:00:00Z' });

test('publication history filters each premium space and exposes only current summary', async () => {
  const rows = [revision(flow, 'flow'), revision(polaroid, 'polaroid'), revision('basic', 'basic')].map(row => ({ ...row, current_id: 'flow', has_current_grant: true }));
  const pool = { async query(sql, values) { assert.match(sql, /WHERE r.site_id=\$1/); assert.match(sql, /g.site_id=r.site_id AND g.product=r.space/); assert.match(sql, /r.id=p.revision_id OR \(r.space=ANY\(\$2::text\[\]\) AND/); assert.equal(values[0], 'site'); assert.ok(values[1].includes('basic')); return { rows }; } };
  const legacy = await publicationHistory(pool, 'site', { allowPremium: true });
  assert.deepEqual(legacy.history.map(row => row.space), [polaroid, 'basic']);
  assert.equal(legacy.current.templateId, flow);
  assert.equal('content' in legacy.current, false);
  assert.ok(legacy.history.every(row => !('content' in row)));
  assert.deepEqual((await publicationHistory(pool, 'site', { authorizedSpaces: new Set([flow]) })).history.map(row => row.space), [flow, 'basic']);
  assert.deepEqual((await publicationHistory(pool, 'site', { allowedSpaces: [flow, polaroid, 'unknown'] })).history.map(row => row.space), [flow, polaroid, 'basic']);
  assert.deepEqual((await publicationHistory(pool, 'site', { authorizedSpaces: [], allowPremium: true })).history.map(row => row.space), ['basic']);
});

test('stale explicit spaces and old premium boolean cannot include revoked histories', async () => {
  const rows = [revision(flow, 'flow'), revision(polaroid, 'polaroid'), revision('basic', 'basic')].map(row => ({ ...row, current_id: 'flow', has_current_grant: row.space === 'basic' }));
  const pool = { async query() { return { rows }; } };
  for (const options of [{ authorizedSpaces: [flow, polaroid] }, { allowedSpaces: [flow, polaroid] }, { allowPremium: true }]) {
    const result = await publicationHistory(pool, 'site', options);
    assert.deepEqual(result.history.map(row => row.space), ['basic']);
    assert.equal(result.current.templateId, flow);
    assert.equal('content' in result.current, false);
  }
});

function fakeTransaction({ grants = [], owner = true, pointer = null, draftRevision = 2, targetSpace = flow } = {}) {
  const calls = [];
  let released = false;
  const row = revision(targetSpace, 'new-id');
  const client = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('FROM sites s JOIN portfolio_users')) return { rowCount: owner ? 1 : 0, rows: owner ? [{ id: 'site' }] : [] };
    if (sql.includes('FROM site_template_grants')) return { rowCount: grants.includes(values[1]) ? 1 : 0, rows: [] };
    if (sql.startsWith('SELECT revision_id')) return { rows: pointer ? [{ revision_id: pointer }] : [] };
    if (sql.includes('FROM site_content_drafts')) return { rowCount: 1, rows: [{ revision: draftRevision, content: row.content }] };
    if (sql.includes('FROM site_assets')) return { rowCount: 0, rows: [] };
    if (sql.startsWith('INSERT INTO site_publication_revisions')) return { rowCount: 1, rows: [row] };
    if (sql.includes('content=$3::jsonb')) return { rowCount: 0, rows: [] };
    if (sql.includes('FROM site_publication_revisions')) return { rowCount: targetSpace === values[1] ? 1 : 0, rows: [{ ...row, asset_ids: [] }] };
    return { rows: [] };
  }, release() { released = true; } };
  return { pool: { async connect() { return client; } }, calls, released: () => released };
}
const publish = tx => changePublication(tx.pool, { siteId: 'site', userId: 'owner', space: flow, payload: { action: 'publish', expectedPublicationId: null, expectedDraftRevision: 2 }, prepare: content => ({ content, assetIds: [] }) });

test('polaroid grant cannot publish or roll back flow gallery and transaction rolls back', async () => {
  for (const action of ['publish', 'rollback']) {
    const tx = fakeTransaction({ grants: [polaroid] });
    await assert.rejects(changePublication(tx.pool, { siteId: 'site', userId: 'owner', space: flow, payload: { action, expectedPublicationId: null, expectedDraftRevision: 2, revisionId: 'new-id' }, prepare: content => ({ content, assetIds: [] }) }), error => error.status === 403);
    const grant = tx.calls.find(call => call.sql.includes('FROM site_template_grants'));
    assert.match(grant.sql, /FOR SHARE/); assert.deepEqual(grant.values, ['site', flow]);
    assert.ok(tx.calls.some(call => call.sql === 'ROLLBACK'));
    assert.ok(!tx.calls.some(call => call.sql.startsWith('INSERT')));
    assert.equal(tx.released(), true);
  }
});

test('flow publication locks Site, grant and exact draft before single pointer commit', async () => {
  const tx = fakeTransaction({ grants: [flow] });
  const result = await publish(tx);
  assert.equal(result.templateId, flow);
  assert.match(tx.calls.find(call => call.sql.includes('FROM sites s JOIN')).sql, /FOR UPDATE OF s/);
  assert.deepEqual(tx.calls.find(call => call.sql.includes('FROM site_content_drafts')).values, ['site', flow]);
  assert.match(tx.calls.find(call => call.sql.includes('FROM site_content_drafts')).sql, /FOR UPDATE/);
  assert.equal(tx.calls.filter(call => call.sql.startsWith('INSERT INTO site_publications')).length, 1);
  assert.equal(tx.calls.at(-1).sql, 'COMMIT'); assert.equal(tx.released(), true);
});

test('flow publish preserves expected pointer and expected draft revision conflicts', async () => {
  for (const scenario of [{ pointer: 'changed' }, { draftRevision: 3 }]) {
    const tx = fakeTransaction({ grants: [flow], ...scenario });
    await assert.rejects(publish(tx), error => error.status === 409);
    assert.ok(tx.calls.some(call => call.sql === 'ROLLBACK'));
    assert.ok(!tx.calls.some(call => call.sql.startsWith('INSERT')));
  }
});

test('flow grant still needs Site ownership and rollback cannot target another space', async () => {
  const denied = fakeTransaction({ grants: [flow], owner: false });
  await assert.rejects(publish(denied), error => error.status === 403);
  assert.ok(!denied.calls.some(call => call.sql.includes('FROM site_template_grants')));
  const tx = fakeTransaction({ grants: [flow], targetSpace: polaroid });
  await assert.rejects(changePublication(tx.pool, { siteId: 'site', userId: 'owner', space: flow, payload: { action: 'rollback', expectedPublicationId: null, revisionId: 'new-id' } }), error => error.status === 404);
  assert.deepEqual(tx.calls.find(call => call.sql.includes('FROM site_publication_revisions')).values, ['site', flow, 'new-id']);
});

test('published flow snapshot reports its own template identity', async () => {
  const pool = { async query(sql, values) { assert.match(sql, /WHERE s.slug=\$1/); assert.deepEqual(values, ['fixture']); return { rows: [{ ...revision(flow, 'flow'), site_id: 'site', slug: 'fixture', asset_ids: [] }] }; } };
  assert.equal((await readPublished(pool, 'fixture')).templateId, flow);
});

test('workspace entry requires independent flow grant and escapes Site slug', () => {
  const card = premium => flowGalleryWorkspaceCard({ templates: { premium } }, 'fixture');
  assert.doesNotMatch(card([polaroid]), /href=/);
  assert.match(card([flow]), /href="\/fixture\/admin\/premium-flow-gallery"/);
  assert.match(flowGalleryWorkspaceCard({ templates: { premium: [flow] } }, 'unsafe"<'), /unsafe&quot;&lt;/);
});

test('workspace public summary distinguishes unknown, unpublished and a saved Published snapshot', () => {
  assert.match(publishedWorkspaceSummary(undefined), /data-workspace-public="unknown"/);
  assert.doesNotMatch(publishedWorkspaceSummary(undefined), /尚未发布作品集/);
  assert.match(publishedWorkspaceSummary(null), /data-workspace-public="unpublished"/);
  const published = { space: 'basic', templateId: 'archive-os', draftRevision: 3 };
  const html = publishedWorkspaceSummary(published, { 'archive-os': '摄影档案系统' });
  assert.match(html, /基础版 · 摄影档案系统/); assert.match(html, /草稿 v3/); assert.doesNotMatch(html, /archive-os/);
  assert.match(publishedWorkspaceSummary({...published, templateId: 'bad"<', space: '<script>'}), /&lt;script&gt;/);
  assert.match(flowGalleryWorkspaceCard({templates: {premium: [flow]}}, 'fixture', { space: flow }), /data-current-public="true"/);
  assert.doesNotMatch(flowGalleryWorkspaceCard({templates: {premium: [flow]}}, 'fixture', published), /data-current-public/);
});

test('published draft shortcut maps only known spaces with their independent rights', () => {
  const account = { site: { slug: 'ownedfixture' }, templates: { basic: ['archive-os'], premium: [polaroid, flow] } };
  for (const [space, route] of [['basic', 'basic/profile'], [polaroid, polaroid], [flow, flow]]) {
    const published = { space, templateId: space, draftRevision: 3 };
    assert.equal(publishedDraftTarget(published, account), `/ownedfixture/admin/${route}`);
    const html = publishedWorkspaceSummary(published, {}, account);
    assert.match(html, /编辑此空间草稿/);
    assert.match(html, /进入该内容空间的当前草稿；历史发布快照保持只读/);
    assert.ok(html.includes(`href="/ownedfixture/admin/${route}"`));
    assert.doesNotMatch(html, /returnTo|revisionId|publications\//);
  }
  const onlyPolaroid = { ...account, templates: { ...account.templates, premium: [polaroid] } };
  assert.equal(publishedDraftTarget({ space: flow }, onlyPolaroid), null);
  assert.doesNotMatch(publishedWorkspaceSummary({ space: flow, draftRevision: 3 }, {}, onlyPolaroid), /href=/);
  assert.match(publishedWorkspaceSummary({ space: flow, draftRevision: 3 }, {}, onlyPolaroid), /data-published-draft-unavailable/);
  assert.equal(publishedDraftTarget({ space: flow }, account, false), null, 'History grant recheck overrides an older account grant');
  assert.doesNotMatch(publishedWorkspaceSummary({ space: flow, draftRevision: 3 }, {}, account, false), /href=/);
  for (const published of [null, undefined, { space: 'unknown' }, { space: '__proto__' }]) {
    assert.equal(publishedDraftTarget(published, account), null);
    assert.doesNotMatch(publishedWorkspaceSummary(published, {}, account), /href=/);
  }
  for (const invalid of [null, { ...account, site: { slug: 'star/../other' } }, { ...account, site: { slug: 'admin' } }]) {
    assert.equal(publishedDraftTarget({ space: flow }, invalid), null);
  }
  assert.equal(publishedDraftTarget({ space: 'basic' }, { ...account, templates: { basic: [], premium: [flow] } }), null);
});

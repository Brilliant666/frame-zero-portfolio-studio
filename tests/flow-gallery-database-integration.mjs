import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { changePublication, publicationHistory, readPublished } from '../db/accounts/publications.mjs';
import { readSiteForPrincipal } from '../db/accounts/http.mjs';

// Only called by the explicit test-database suite. Schema is isolated from its
// ordinary fixtures as well as every application database and running instance.
export async function flowGalleryDatabaseIntegration({ runtime }) {
  const client = await runtime.pool.connect();
  const schema = `flow_upgrade_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  try {
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
    await client.query(`CREATE SCHEMA "${schema}"`); created = true;
    await client.query(`SET search_path TO "${schema}"`);
    for (const file of ['0000_sparkling_magma', '0001_awesome_phil_sheldon', '0002_site_assets', '0003_site_publications', '0004_basic_publications']) {
      const sql = await readFile(new URL(`../drizzle-accounts/${file}.sql`, import.meta.url), 'utf8');
      await client.query(sql.replaceAll('"public".', `"${schema}".`));
    }
    const userId = randomUUID(), ownerId = randomUUID(), siteId = randomUUID(), intent = randomUUID();
    await client.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [userId, 'Flow fixture', 'flow-upgrade@example.invalid']);
    await client.query('INSERT INTO account_provisioning(id,username,email,slug,completed_at) VALUES($1,$2,$3,$2,now())', [intent, 'flowupgrade', 'flow-upgrade@example.invalid']);
    await client.query('INSERT INTO portfolio_users(id,auth_user_id,provisioning_id) VALUES($1,$2,$3)', [ownerId, userId, intent]);
    await client.query('INSERT INTO sites(id,slug,owner_id) VALUES($1,$2,$3)', [siteId, 'flowupgrade', ownerId]);
    await client.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'premium-polaroid','operator-test')", [randomUUID(), siteId]);
    const basicContent = { activeTemplate: 'film-rail', profile: { photographer: 'Basic unchanged' }, works: [] };
    const premiumContent = { profile: { photographer: 'Polaroid unchanged' }, collections: [] };
    await client.query("INSERT INTO site_content_drafts(site_id,space,revision,content) VALUES($1,'basic',1,$2::jsonb),($1,'premium-polaroid',2,$3::jsonb)", [siteId, JSON.stringify(basicContent), JSON.stringify(premiumContent)]);
    const old = (await client.query("INSERT INTO site_publication_revisions(site_id,space,draft_revision,content,asset_ids) VALUES($1,'premium-polaroid',2,$2::jsonb,'{}') RETURNING *", [siteId, JSON.stringify(premiumContent)])).rows[0];
    await client.query('INSERT INTO site_publications(site_id,revision_id) VALUES($1,$2)', [siteId, old.id]);
    const beforeDrafts = (await client.query('SELECT * FROM site_content_drafts ORDER BY space')).rows;
    const beforeGrants = (await client.query('SELECT * FROM site_template_grants ORDER BY product')).rows;
    await assert.rejects(client.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'premium-flow-gallery','operator-test')", [randomUUID(), siteId]), /known_template_product/);
    const migration = await readFile(new URL('../drizzle-accounts/0005_flow_gallery_space.sql', import.meta.url), 'utf8');
    await client.query(migration);
    await client.query(migration);
    assert.deepEqual((await client.query('SELECT * FROM site_content_drafts ORDER BY space')).rows, beforeDrafts);
    assert.deepEqual((await client.query('SELECT * FROM site_template_grants ORDER BY product')).rows, beforeGrants);
    assert.deepEqual((await client.query('SELECT * FROM site_publication_revisions WHERE id=$1', [old.id])).rows[0], old);
    assert.equal((await client.query('SELECT revision_id FROM site_publications WHERE site_id=$1', [siteId])).rows[0].revision_id, old.id);
    for (const sql of ['UPDATE site_publication_revisions SET content=content WHERE id=$1', 'DELETE FROM site_publication_revisions WHERE id=$1']) await assert.rejects(client.query(sql, [old.id]), /immutable/);
    const pool = { query: (...args) => client.query(...args), connect: async () => ({ query: (...args) => client.query(...args), release() {} }) };
    const flow = 'premium-flow-gallery';
    const flowContent = { profile: { title: 'Independent Flow fixture' }, groups: [] };
    await client.query('INSERT INTO site_content_drafts(site_id,space,revision,content) VALUES($1,$2,1,$3::jsonb)', [siteId, flow, JSON.stringify(flowContent)]);
    const prepare = content => ({ content, assetIds: [] });
    const change = (space, payload, actor = userId) => changePublication(pool, { siteId, userId: actor, space, payload, prepare });
    const publish = (space, revision, pointer, actor) => change(space, { action: 'publish', expectedDraftRevision: revision, expectedPublicationId: pointer }, actor);
    const rollback = (space, id, pointer) => change(space, { action: 'rollback', revisionId: id, expectedPublicationId: pointer });
    assert.deepEqual((await readSiteForPrincipal({ pool }, { id: userId }, siteId)).templates.premium, ['premium-polaroid']);
    await assert.rejects(publish(flow, 1, old.id), error => error.status === 403);
    await client.query('INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,$3,\'operator-test\')', [randomUUID(), siteId, flow]);
    assert.deepEqual(new Set((await readSiteForPrincipal({ pool }, { id: userId }, siteId)).templates.premium), new Set(['premium-polaroid', flow]));
    await assert.rejects(publish(flow, 1, old.id, randomUUID()), error => error.status === 403);
    const published = await publish(flow, 1, old.id);
    assert.equal(published.templateId, flow);
    const snapshot = await readPublished(pool, 'flowupgrade');
    assert.deepEqual(snapshot.content, flowContent); assert.equal(snapshot.templateId, flow);
    const legacyHistory = await publicationHistory(pool, siteId, { allowPremium: true });
    assert.equal(legacyHistory.current.templateId, flow);
    assert.deepEqual(legacyHistory.history.map(row => row.id), [old.id]);
    assert.ok(!('content' in legacyHistory.current));
    assert.deepEqual((await publicationHistory(pool, siteId, { authorizedSpaces: [flow] })).history.map(row => row.id), [published.id]);
    const staleSpaces = (await readSiteForPrincipal({ pool }, { id: userId }, siteId)).templates.premium;
    await client.query('DELETE FROM site_template_grants WHERE site_id=$1 AND product=$2', [siteId, flow]);
    const revokedHistory = await publicationHistory(pool, siteId, { authorizedSpaces: staleSpaces });
    assert.deepEqual(revokedHistory.history.map(row => row.id), [old.id]);
    assert.equal(revokedHistory.current.id, published.id);
    assert.equal('content' in revokedHistory.current, false);
    await client.query("DELETE FROM site_template_grants WHERE site_id=$1 AND product='premium-polaroid'", [siteId]);
    assert.deepEqual((await publicationHistory(pool, siteId, { allowPremium: true })).history, []);
    assert.deepEqual((await publicationHistory(pool, siteId, { authorizedSpaces: staleSpaces })).history, []);
    await client.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'premium-polaroid','operator-test')", [randomUUID(), siteId]);
    await assert.rejects(rollback(flow, published.id, published.id), error => error.status === 403);
    assert.equal((await readPublished(pool, 'flowupgrade')).id, published.id);
    const basic = await publish('basic', 1, published.id);
    assert.equal((await rollback('premium-polaroid', old.id, basic.id)).id, old.id);
    assert.deepEqual((await client.query("SELECT * FROM site_content_drafts WHERE space != 'premium-flow-gallery' ORDER BY space")).rows, beforeDrafts);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM site_publications WHERE site_id=$1', [siteId])).rows[0].n, 1);
    await assert.rejects(client.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'unknown','operator-test')", [randomUUID(), siteId]), /known_template_product/);
    await assert.rejects(client.query("INSERT INTO site_content_drafts(site_id,space,revision,content) VALUES($1,'unknown',1,'{}')", [siteId]), /known_content_space/);
    await assert.rejects(client.query("INSERT INTO site_publication_revisions(site_id,space,draft_revision,content,asset_ids) VALUES($1,'unknown',1,'{}','{}')", [siteId]), /publication_known_space/);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('RESET search_path');
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
  }
}

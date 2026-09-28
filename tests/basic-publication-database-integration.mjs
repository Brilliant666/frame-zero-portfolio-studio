import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { changePublication, publicationHistory, readPublished } from '../db/accounts/publications.mjs';

// Called serially by the dedicated PostgreSQL suite. No business database access.
export async function basicPublicationDatabaseIntegration({ runtime }) {
  const client = await runtime.pool.connect();
  const schema = `publication_upgrade_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  try {
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
    await client.query(`CREATE SCHEMA "${schema}"`); created = true;
    await client.query(`SET search_path TO "${schema}"`);
    for (const file of ['0000_sparkling_magma', '0001_awesome_phil_sheldon', '0002_site_assets', '0003_site_publications']) {
      const sql = await readFile(new URL(`../drizzle-accounts/${file}.sql`, import.meta.url), 'utf8');
      // Original generated migrations qualify public FKs; bind their exact SQL to this isolated schema.
      await client.query(sql.replaceAll('"public".', `"${schema}".`));
    }
    const userId = randomUUID(), ownerId = randomUUID(), siteId = randomUUID(), intent = randomUUID();
    await client.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [userId, 'Upgrade fixture', 'upgrade@example.invalid']);
    await client.query('INSERT INTO account_provisioning(id,username,email,slug,completed_at) VALUES($1,$2,$3,$2,now())', [intent, 'upgradefixture', 'upgrade@example.invalid']);
    await client.query('INSERT INTO portfolio_users(id,auth_user_id,provisioning_id) VALUES($1,$2,$3)', [ownerId, userId, intent]);
    await client.query('INSERT INTO sites(id,slug,owner_id) VALUES($1,$2,$3)', [siteId, 'upgradefixture', ownerId]);
    await client.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'premium-polaroid','operator-test')", [randomUUID(), siteId]);
    const oldContent = { profile: { photographer: 'Old immutable premium' }, collections: [] };
    const old = (await client.query("INSERT INTO site_publication_revisions(site_id,space,draft_revision,content,asset_ids) VALUES($1,'premium-polaroid',1,$2::jsonb,'{}') RETURNING *", [siteId, JSON.stringify(oldContent)])).rows[0];
    await client.query('INSERT INTO site_publications(site_id,revision_id) VALUES($1,$2)', [siteId, old.id]);
    await assert.rejects(client.query("INSERT INTO site_publication_revisions(site_id,space,draft_revision,content,asset_ids) VALUES($1,'basic',1,'{}','{}')", [siteId]), /space_check/);
    await client.query(await readFile(new URL('../drizzle-accounts/0004_basic_publications.sql', import.meta.url), 'utf8'));
    const pool = { query: (...args) => client.query(...args), connect: async () => ({ query: (...args) => client.query(...args), release() {} }) };
    const upgraded = await readPublished(pool, 'upgradefixture');
    assert.equal(upgraded.id, old.id); assert.deepEqual(upgraded.content, oldContent); assert.equal(upgraded.templateId, 'premium-polaroid');
    assert.equal(upgraded.publishedAt.toISOString(), old.published_at.toISOString());
    for (const sql of ['UPDATE site_publication_revisions SET content=content WHERE id=$1', 'DELETE FROM site_publication_revisions WHERE id=$1']) await assert.rejects(client.query(sql, [old.id]), /immutable/);
    const basicContent = { activeTemplate: 'cinematic-light', profile: { photographer: 'Basic fixture' }, works: [] };
    await client.query("INSERT INTO site_content_drafts(site_id,space,revision,content) VALUES($1,'basic',1,$2::jsonb),($1,'premium-polaroid',2,$3::jsonb)", [siteId, JSON.stringify(basicContent), JSON.stringify({ ...oldContent, profile: { photographer: 'Premium current draft' } })]);
    const prepare = content => ({ content, assetIds: [] });
    const change = (space, payload, actor = userId) => changePublication(pool, { siteId, userId: actor, space, payload, prepare });
    const publish = (space, revision, pointer) => change(space, { action: 'publish', expectedDraftRevision: revision, expectedPublicationId: pointer });
    const rollback = (space, id, pointer) => change(space, { action: 'rollback', revisionId: id, expectedPublicationId: pointer });
    await client.query('DELETE FROM site_template_grants WHERE site_id=$1', [siteId]);
    const basic = await publish('basic', 1, old.id);
    assert.equal(basic.space, 'basic'); assert.equal(basic.templateId, 'cinematic-light');
    assert.equal((await readPublished(pool, 'upgradefixture')).id, basic.id);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM site_publications WHERE site_id=$1', [siteId])).rows[0].n, 1);
    await assert.rejects(publish('premium-polaroid', 2, basic.id), error => error.status === 403);
    await assert.rejects(rollback('basic', old.id, basic.id), error => error.status === 404);
    await assert.rejects(rollback('premium-polaroid', old.id, basic.id), error => error.status === 403);
    await assert.rejects(change('basic', { action: 'rollback', revisionId: basic.id, expectedPublicationId: basic.id }, randomUUID()), error => error.status === 403);
    await assert.rejects(publish('basic', 1, old.id), error => error.status === 409);
    const limited = await publicationHistory(pool, siteId, { allowPremium: false });
    assert.deepEqual(limited.history.map(row => row.id), [basic.id]);
    assert.ok(limited.history.every(row => !('content' in row)));
    await client.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'premium-polaroid','operator-test')", [randomUUID(), siteId]);
    const premium = await publish('premium-polaroid', 2, basic.id);
    assert.equal(premium.templateId, 'premium-polaroid');
    const hidden = await publicationHistory(pool, siteId, { allowPremium: false });
    assert.equal(hidden.current.id, premium.id); assert.equal(hidden.current.space, 'premium-polaroid'); assert.equal(hidden.current.templateId, 'premium-polaroid');
    assert.equal(hidden.history.length, 1); assert.equal('content' in hidden.current, false);
    assert.equal((await publicationHistory(pool, siteId, { allowPremium: true })).history.length, 3);
    assert.equal((await rollback('premium-polaroid', old.id, premium.id)).id, old.id);
    assert.deepEqual((await readPublished(pool, 'upgradefixture')).content, oldContent);
    assert.equal((await rollback('basic', basic.id, old.id)).id, basic.id);
    const drafts = (await client.query('SELECT space,revision,content FROM site_content_drafts WHERE site_id=$1 ORDER BY space', [siteId])).rows;
    assert.equal(drafts[0].revision, 1); assert.deepEqual(drafts[0].content, basicContent); assert.equal(drafts[1].revision, 2);
    await assert.rejects(client.query("INSERT INTO site_publication_revisions(site_id,space,draft_revision,content,asset_ids) VALUES($1,'unknown',1,'{}','{}')", [siteId]), /publication_known_space/);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('RESET search_path');
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
  }
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { readPublished } from '../db/accounts/publications.mjs';

// Run only from the dedicated account CI suite, never against retained review data.
export async function workbenchShortcutHttpIntegration({ runtime, password, request, login, readDraft, saveDraft, sitePage }) {
  assert.equal(runtime.config.isTest, true);
  assert.equal((await runtime.pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
  const slug = 'entryshortcutfixture', other = 'entryshortcutoutsider';
  const provision = name => provisionAccount(runtime, { username: name, slug: name, email: `${name}@example.invalid`, password, premium: true });
  const owner = await provision(slug); await provision(other);
  await runtime.pool.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'premium-flow-gallery','operator-test')", [randomUUID(), owner.siteId]);
  const cookie = await login(slug), outsider = await login(other);
  const workbench = actor => sitePage(`/${slug}/admin`, 200, actor);
  const state = async () => {
    const result = await runtime.pool.query(`SELECT
      (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.space), '[]'::jsonb) FROM site_content_drafts d WHERE d.site_id=$1) AS drafts,
      (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM site_publications p WHERE p.site_id=$1) AS published,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb) FROM site_publication_revisions r WHERE r.site_id=$1) AS history,
      (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.id), '[]'::jsonb) FROM site_template_grants g WHERE g.site_id=$1) AS grants,
      (SELECT to_jsonb(s) FROM sites s WHERE s.id=$1) AS site`, [owner.siteId]);
    return result.rows[0];
  };
  const entryTarget = html => html.match(/<a[^>]+data-published-draft-entry="[^"]+"[^>]+href="([^"]+)"/u)?.[1] ?? null;
  const unpublishedBefore = await state();
  const unpublished = await workbench(cookie);
  assert.match(unpublished, /data-workspace-public="unpublished"/);
  assert.equal(entryTarget(unpublished), null, 'No publication does not infer an editing preference');
  assert.equal((unpublished.match(/class="space"/g) ?? []).length, 3, 'The original three content cards remain');
  assert.deepEqual(await state(), unpublishedBefore, 'Reading unpublished workbench performs no business writes');
  let pointer = null;
  for (const [space, route] of [['basic', 'basic/profile'], ['premium-polaroid', 'premium-polaroid'], ['premium-flow-gallery', 'premium-flow-gallery']]) {
    const initial = await readDraft(slug, space, cookie);
    initial.content.profile.brand = `PUBLISHED-${space}`;
    const firstSave = await saveDraft(slug, space, cookie, initial.content, initial.revision);
    assert.equal(firstSave.status, 200); const firstDraft = await firstSave.json();
    const response = await request(`/api/sites/${slug}/publications/${space}`, { cookie, body: { action: 'publish', expectedDraftRevision: firstDraft.revision, expectedPublicationId: pointer } });
    assert.equal(response.status, 200); const publication = (await response.json()).publication; pointer = publication.id;
    const currentContent = structuredClone(firstDraft.content); currentContent.profile.brand = `CURRENT-DRAFT-${space}`;
    const secondSave = await saveDraft(slug, space, cookie, currentContent, firstDraft.revision);
    assert.equal(secondSave.status, 200); const currentDraft = await secondSave.json();
    const beforeEntry = await state();
    const html = await workbench(cookie);
    const target = entryTarget(html);
    assert.equal(target, `/${slug}/admin/${route}`);
    assert.match(html, /进入该内容空间的当前草稿；历史发布快照保持只读/);
    assert.equal((html.match(/data-published-draft-entry=/g) ?? []).length, 1);
    assert.equal((html.match(/class="space(?:"| )/g) ?? []).length, 3);
    assert.doesNotMatch(target, /\?|publications|preview/);
    const editor = await request(target, { cookie });
    assert.equal(editor.status, 200, 'Shortcut follows the existing authenticated editor page');
    assert.ok((await editor.text()).includes(`/api/sites/${slug}/drafts/${space}`), 'The authorized editor is wired to the current draft endpoint, not a historical snapshot');
    assert.deepEqual(await readDraft(slug, space, cookie), currentDraft);
    const snapshot = await readPublished(runtime.pool, slug);
    assert.equal(snapshot.id, publication.id); assert.equal(snapshot.draftRevision, firstDraft.revision);
    assert.equal(snapshot.content.profile.brand, `PUBLISHED-${space}`);
    assert.deepEqual(await state(), beforeEntry, 'Opening the shortcut changes no draft, pointer, history, grant or Site preference');
    const ownOther = await sitePage(`/${other}/admin`, 200, outsider);
    assert.equal(entryTarget(ownOther), null); assert.ok(!ownOther.includes(slug), 'Another logged-in Site receives only its own routes');
    const denied = await sitePage(`/${slug}/admin`, 403, outsider);
    assert.equal(entryTarget(denied), null); assert.ok(!denied.includes(slug));
    assert.equal((await request(target, { cookie: outsider })).status, 404);
    assert.equal((await request(`/api/sites/${slug}/drafts/${space}`, { cookie: outsider })).status, 403);
    assert.equal((await request(`/api/sites/${slug}/drafts/${space}`)).status, 401);
    if (space !== 'basic') {
      const removed = await runtime.pool.query('DELETE FROM site_template_grants WHERE site_id=$1 AND product=$2 RETURNING *', [owner.siteId, space]);
      assert.equal(removed.rowCount, 1);
      try {
        const revokedBefore = await state();
        const revoked = await workbench(cookie);
        assert.ok(revoked.includes(`data-workspace-public="${space}"`), 'Public identity survives revocation');
        assert.match(revoked, /data-published-draft-unavailable/);
        assert.equal(entryTarget(revoked), null);
        assert.ok(!revoked.includes(`href="${target}"`), 'Neither shortcut nor original space card exposes an ungranted target');
        assert.equal((await request(target, { cookie })).status, 404, 'A previously rendered href cannot bypass new authorization');
        assert.equal((await request(`/api/sites/${slug}/drafts/${space}`, { cookie })).status, 403);
        assert.equal((await readPublished(runtime.pool, slug)).id, pointer);
        assert.deepEqual(await state(), revokedBefore, 'Reads do not restore the revoked right or modify business records');
      } finally {
        const row = removed.rows[0];
        await runtime.pool.query('INSERT INTO site_template_grants(id,site_id,product,source,created_at) VALUES($1,$2,$3,$4,$5)', [row.id, row.site_id, row.product, row.source, row.created_at]);
      }
    }
  }
  await sitePage(`/${slug}/admin`, 401);
  await sitePage(`/${slug}/admin?returnTo=/${other}/admin`, 400, cookie);
}

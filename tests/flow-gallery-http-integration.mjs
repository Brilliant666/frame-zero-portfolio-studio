import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { readPublished } from '../db/accounts/publications.mjs';
import { assetPath } from '../db/accounts/assets.mjs';

/** Invoked only by the dedicated account suite, using its temporary asset root. */
export async function flowGalleryHttpIntegration({ runtime, origin, password, request, login, readDraft, saveDraft, sitePage, assetRoot }) {
  assert.equal(runtime.config.isTest, true);
  assert.equal((await runtime.pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
  assert.equal(path.isAbsolute(assetRoot), true);
  assert.match(path.basename(assetRoot), /^site-assets-integration-/);
  const space = 'premium-flow-gallery', slug = 'flowpublishfixture', other = 'flowpublishoutsider', polaroidOnly = 'flowpolaroidonly';
  const provision = async (name, premium = false) => provisionAccount(runtime, { username: name, slug: name, email: `${name}@example.invalid`, password, premium });
  const owner = await provision(slug), outsideSite = await provision(other);
  await provision(polaroidOnly, true);
  const cookie = await login(slug), outsider = await login(other), oldPremium = await login(polaroidOnly);
  const draftPath = (name = slug) => `/api/sites/${name}/drafts/${space}`;
  const publicationPath = (name = slug, contentSpace = space) => `/api/sites/${name}/publications/${contentSpace}`;
  const publication = (actor, body, name = slug, contentSpace = space) => request(publicationPath(name, contentSpace), { cookie: actor, body });
  const grant = siteId => runtime.pool.query('INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,$3,\'operator-test\')', [randomUUID(), siteId, space]);

  // An existing polaroid right never opens this independent premium product.
  for (const [name, actor] of [[slug, cookie], [polaroidOnly, oldPremium]]) {
    assert.equal((await request(draftPath(name), { cookie: actor })).status, 403);
    assert.equal((await request(draftPath(name), { cookie: actor, method: 'PUT', body: { content: {}, expectedRevision: 0 } })).status, 403);
    assert.equal((await publication(actor, { action: 'publish', expectedDraftRevision: 1, expectedPublicationId: null }, name)).status, 403);
    assert.equal((await request(`/${name}/admin/${space}`, { cookie: actor })).status, 404);
  }
  await grant(owner.siteId); await grant(outsideSite.siteId);
  const rights = await (await request('/api/account/site', { cookie })).json();
  assert.deepEqual(rights.templates.premium, [space], 'Exactly the third-space grant; no inherited polaroid grant');
  assert.equal((await request(`/api/sites/${slug}/drafts/premium-polaroid`, { cookie })).status, 403);
  for (const [actor, status] of [[undefined, 401], [outsider, 403]]) {
    assert.equal((await request(draftPath(), { cookie: actor })).status, status);
    assert.equal((await request(draftPath(), { cookie: actor, method: 'PUT', body: { content: {}, expectedRevision: 0 } })).status, status);
    assert.equal((await publication(actor, { action: 'publish', expectedDraftRevision: 1, expectedPublicationId: null })).status, status);
  }
  assert.equal((await request(`/${slug}/admin/${space}`, { cookie })).status, 200);
  assert.equal((await request(`/${slug}/admin/${space}`, { cookie: outsider })).status, 404);
  const entry = await sitePage(`/${slug}/admin`, 200, cookie);
  assert.ok(entry.includes(`href="/${slug}/admin/${space}"`));

  const empty = await readDraft(slug, space, cookie);
  assert.equal(empty.revision, 0); assert.equal(empty.updatedAt, null);
  assert.deepEqual(empty.content.profile, { brand: '', title: '', intro: '' });
  assert.deepEqual(empty.content.groups, []); assert.equal(empty.content.background.assetId, null);
  assert.deepEqual(empty.content.rails, { leftGroupId: null, rightGroupId: null });
  assert.equal(empty.content.pricing.enabled, false); assert.equal(empty.content.contact.enabled, false);
  assert.doesNotMatch(JSON.stringify(empty.content), /fixture|shaomaimai|preview\/flow-gallery|\/photos\//i);
  assert.deepEqual((await readDraft(other, space, outsider)).content, empty.content);
  const basic = await readDraft(slug, 'basic', cookie);
  basic.content.profile.brand = basic.content.profile.photographer = basic.content.hero.title = 'FLOW-BASIC-PUBLISHED';
  const basicSave = await saveDraft(slug, 'basic', cookie, basic.content, 0);
  assert.equal(basicSave.status, 200); const savedBasic = await basicSave.json();

  const upload = async (name, actor, color) => {
    const bytes = await sharp({ create: { width: 90, height: 60, channels: 3, background: color } }).png().toBuffer();
    const response = await fetch(`${origin}/api/sites/${name}/assets`, { method: 'POST', headers: { origin, cookie: actor, 'content-type': 'image/png', 'x-file-name': 'flow-anonymous-fixture.png' }, body: bytes, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 201); return (await response.json()).asset.id;
  };
  const assets = [];
  for (const color of ['#243451', '#243452', '#243453', '#243454', '#243455', '#243456']) assets.push(await upload(slug, cookie, color));
  const foreignAsset = await upload(other, outsider, '#243457');
  const d = structuredClone(empty.content), hiddenId = randomUUID(), visibleId = randomUUID();
  d.profile = { brand: 'FLOW-PUBLISHED-BRAND', title: 'FLOW-PUBLISHED-TITLE', intro: 'FLOW-PUBLISHED-INTRO' };
  d.background = { assetId: assets[0], focalPoint: { x: 35, y: 60 } };
  d.groups = [{ id: hiddenId, name: 'FLOW-HIDDEN-GROUP', assetIds: [assets[3]], captions: { [assets[3]]: 'FLOW-HIDDEN-CAPTION' }, visible: false }, { id: visibleId, name: 'FLOW-PUBLISHED-GROUP', assetIds: [assets[2], assets[1]], captions: { [assets[2]]: 'FLOW-PUBLISHED-CAPTION' }, visible: true }];
  d.rails = { leftGroupId: visibleId, rightGroupId: hiddenId };
  d.pricing = { enabled: true, heading: 'FLOW-PUBLISHED-PRICING', introduction: '', packages: [{ id: randomUUID(), name: 'FLOW-DISABLED-PACKAGE', price: '', description: '', details: [], enabled: false }, { id: randomUUID(), name: 'FLOW-PUBLISHED-PACKAGE', price: '100', description: '', details: [], enabled: true }] };
  d.contact = { enabled: true, heading: 'FLOW-PUBLISHED-CONTACT', intro: '', items: [{ id: randomUUID(), label: 'FLOW-EMPTY-CONTACT', value: ' ', href: '' }, { id: randomUUID(), label: 'FLOW-QR-CONTACT', value: '', href: '', qrAssetId: assets[4] }, { id: randomUUID(), label: 'FLOW-TEXT-CONTACT', value: 'Available by email', href: 'mailto:flow@example.invalid' }] };

  // Every reference channel, including hidden/disabled draft content, is owner-scoped.
  for (const change of [
    value => { value.background.assetId = foreignAsset; },
    value => { value.groups[0].assetIds = [foreignAsset]; value.groups[0].captions = {}; },
    value => { value.contact.enabled = false; value.contact.items[1].qrAssetId = foreignAsset; },
  ]) {
    const forged = structuredClone(d); change(forged);
    assert.equal((await saveDraft(slug, space, cookie, forged, 0)).status, 422);
    assert.equal((await readDraft(slug, space, cookie)).revision, 0);
  }
  const invalid = structuredClone(d); invalid.contact.items[2].href = 'javascript:alert(1)';
  assert.equal((await saveDraft(slug, space, cookie, invalid, 0)).status, 400);
  const savedResponse = await saveDraft(slug, space, cookie, d, 0); assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json(); assert.equal(saved.revision, 1); assert.deepEqual(saved.content, d);
  const stale = structuredClone(d); stale.profile.title = 'FLOW-STALE-OVERWRITE';
  assert.equal((await saveDraft(slug, space, cookie, stale, 0)).status, 409);
  assert.deepEqual(await readDraft(slug, space, cookie), saved);
  assert.deepEqual(await readDraft(slug, 'basic', cookie), savedBasic);
  assert.equal((await readDraft(other, space, outsider)).revision, 0);
  assert.equal(await readPublished(runtime.pool, slug), null, 'Save alone does not move the public pointer');
  assert.match(await sitePage(`/${slug}`, 200), /data-site-state="unpublished"/);
  const preview = await request(`/${slug}/admin/preview/${space}`, { cookie });
  assert.equal(preview.status, 200); assert.match(preview.headers.get('cache-control'), /private/);
  const previewHtml = await preview.text(); assert.match(previewHtml, /已保存草稿预览/); assert.match(previewHtml, /FLOW-PUBLISHED-TITLE/);
  assert.equal((await request(`/${slug}/admin/preview/${space}`, { cookie: outsider })).status, 404);
  const anonymousPreview = await request(`/${slug}/admin/preview/${space}`);
  assert.match(new URL(anonymousPreview.url).pathname, /^\/login$/);
  assert.doesNotMatch(await anonymousPreview.text(), /FLOW-PUBLISHED-TITLE/);
  assert.equal((await request(`/api/sites/${slug}/assets/${assets[1]}/full`)).status, 401);

  assert.equal((await publication(cookie, { action: 'publish', expectedDraftRevision: 2, expectedPublicationId: null })).status, 409);
  const publishResponse = await publication(cookie, { action: 'publish', expectedDraftRevision: saved.revision, expectedPublicationId: null });
  assert.equal(publishResponse.status, 200); const first = (await publishResponse.json()).publication;
  assert.equal(first.space, space); assert.equal(first.templateId, space); assert.equal(first.draftRevision, saved.revision);
  const snapshot = await readPublished(runtime.pool, slug);
  assert.equal(snapshot.id, first.id); assert.deepEqual(snapshot.assetIds, [assets[0], assets[2], assets[1], assets[4]]);
  assert.deepEqual(snapshot.content.groups.map(group => group.id), [visibleId]);
  assert.deepEqual(snapshot.content.groups[0].assetIds, [assets[2], assets[1]]);
  assert.deepEqual(snapshot.content.rails, { leftGroupId: visibleId, rightGroupId: null });
  assert.deepEqual(snapshot.content.contact.items.map(item => item.id), [d.contact.items[1].id, d.contact.items[2].id]);
  const publicResponse = await request(`/${slug}`); assert.equal(publicResponse.status, 200);
  const html = await publicResponse.text();
  assert.match(html, /data-publication-space="premium-flow-gallery"/);
  assert.ok(html.includes(`data-publication-id="${first.id}"`));
  assert.match(html, /<title>[^<]*FLOW-PUBLISHED-BRAND/);
  assert.doesNotMatch(html, /<title>[^<]*FLOW-PUBLISHED-TITLE/);
  assert.match(html, /<meta name="description" content="FLOW-PUBLISHED-INTRO"/);
  assert.match(html, /<meta property="og:title" content="FLOW-PUBLISHED-BRAND"/);
  assert.match(html, /FLOW-PUBLISHED-GROUP/);
  assert.doesNotMatch(html, /FLOW-HIDDEN-GROUP|FLOW-HIDDEN-CAPTION|FLOW-DISABLED-PACKAGE|FLOW-EMPTY-CONTACT|FLOW-BASIC-PUBLISHED|\/preview\/flow-gallery\/asset|shaomaimai\.icu/);
  const publicAssetPath = (id, variant = 'full', name = slug) => `/api/public-sites/${name}/assets/${id}/${variant}`;
  let cachedFullEtag;
  for (const id of snapshot.assetIds) for (const variant of ['thumbnail', 'card', 'full']) {
    const response = await request(publicAssetPath(id, variant));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-cache, must-revalidate');
    const etag = response.headers.get('etag'); assert.match(etag, /^"[a-f0-9]{64}"$/);
    const bytes = await response.arrayBuffer(); assert.ok(bytes.byteLength > 0);
    for (const method of ['GET', 'HEAD']) {
      const revalidated = await request(publicAssetPath(id, variant), { method, headers: { 'if-none-match': etag } });
      assert.equal(revalidated.status, 304); assert.equal((await revalidated.arrayBuffer()).byteLength, 0);
      assert.equal(revalidated.headers.get('etag'), etag);
      assert.equal(revalidated.headers.get('cache-control'), 'private, no-cache, must-revalidate');
    }
    const head = await request(publicAssetPath(id, variant), { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.headers.get('etag'), etag);
    assert.equal(Number(head.headers.get('content-length')), bytes.byteLength); assert.equal((await head.arrayBuffer()).byteLength, 0);
    if (id === assets[1] && variant === 'full') cachedFullEtag = etag;
  }
  assert.equal((await request(publicAssetPath(assets[1]), { headers: { 'if-none-match': '"stale"' } })).status, 200);
  assert.equal((await request(publicAssetPath(assets[1]), { headers: { 'if-none-match': `"stale", W/${cachedFullEtag}` } })).status, 304);
  assert.equal((await request(publicAssetPath(assets[1]), { headers: { 'if-none-match': '*' } })).status, 304);
  assert.equal((await request(publicAssetPath(assets[1]), { headers: { range: 'bytes=0-5', 'if-none-match': cachedFullEtag } })).status, 416);
  for (const [name, id, variant] of [[slug, assets[3], 'full'], [slug, assets[5], 'full'], [slug, foreignAsset, 'full'], [other, assets[1], 'full'], [slug, assets[1], 'original']]) {
    for (const validator of [cachedFullEtag, '*']) assert.equal((await request(publicAssetPath(id, variant, name), { headers: { 'if-none-match': validator } })).status, 404);
  }
  assert.equal((await request(`/api/sites/${slug}/assets/${assets[1]}/full`, { headers: { 'if-none-match': cachedFullEtag } })).status, 401);
  // A cached validator cannot hide a missing file. This only renames this
  // suite's anonymous fixture beneath its dedicated temporary asset root.
  const stored = (await runtime.pool.query('SELECT variants FROM site_assets WHERE site_id=$1 AND id=$2', [owner.siteId, assets[1]])).rows[0];
  const fullPath = assetPath(assetRoot, stored.variants.full.key), unavailablePath = `${fullPath}.cache-test`;
  await rename(fullPath, unavailablePath);
  try { assert.equal((await request(publicAssetPath(assets[1]), { headers: { 'if-none-match': cachedFullEtag } })).status, 503); }
  finally { await rename(unavailablePath, fullPath); }
  assert.equal((await request(`/api/sites/${slug}/assets`)).status, 401);
  assert.equal((await publication(outsider, { action: 'rollback', revisionId: first.id, expectedPublicationId: null }, other)).status, 404);

  await runtime.pool.query('DELETE FROM site_template_grants WHERE site_id=$1 AND product=$2', [owner.siteId, space]);
  const currentWithoutGrant = await (await request(publicationPath(slug, 'basic'), { cookie })).json();
  assert.equal(currentWithoutGrant.current.id, first.id); assert.equal(currentWithoutGrant.current.templateId, space);
  assert.ok(!('content' in currentWithoutGrant.current)); assert.ok(currentWithoutGrant.history.every(row => row.space !== space));
  assert.equal((await request(draftPath(), { cookie })).status, 403);
  assert.match(await (await request(`/${slug}`)).text(), /FLOW-PUBLISHED-TITLE/, 'Revoking an editor grant does not rewrite the public pointer');
  await grant(owner.siteId);

  const unpublished = structuredClone(d); unpublished.profile.title = 'FLOW-NEW-PRIVATE-DRAFT'; unpublished.profile.intro = 'FLOW-NEW-PRIVATE-INTRO';
  const nextResponse = await saveDraft(slug, space, cookie, unpublished, saved.revision); assert.equal(nextResponse.status, 200);
  const nextDraft = await nextResponse.json(); assert.equal(nextDraft.revision, 2);
  assert.equal((await readPublished(runtime.pool, slug)).id, first.id);
  assert.doesNotMatch(await (await request(`/${slug}`)).text(), /FLOW-NEW-PRIVATE-DRAFT|FLOW-NEW-PRIVATE-INTRO/);

  // All three spaces use one address and one pointer while keeping their drafts.
  const basicPublishedResponse = await publication(cookie, { action: 'publish', expectedDraftRevision: savedBasic.revision, expectedPublicationId: first.id }, slug, 'basic');
  assert.equal(basicPublishedResponse.status, 200); const basicPublished = (await basicPublishedResponse.json()).publication;
  assert.match(await (await request(`/${slug}`)).text(), /data-publication-space="basic"/);
  for (const method of ['GET', 'HEAD']) for (const validator of [cachedFullEtag, '*']) {
    assert.equal((await request(publicAssetPath(assets[1]), { method, headers: { 'if-none-match': validator } })).status, 404, 'Current Published removal wins over a cached validator');
  }
  await runtime.pool.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'premium-polaroid','operator-test')", [randomUUID(), owner.siteId]);
  const polaroid = await readDraft(slug, 'premium-polaroid', cookie);
  polaroid.content.profile.photographer = 'FLOW-POLAROID-PUBLISHED';
  polaroid.content.collections = [{ id: randomUUID(), name: 'Independent polaroid', description: '', visible: true, assetIds: [assets[5]], coverAssetId: null, focusAssetId: null, coverFit: 'natural', coverFocusX: 50, coverFocusY: 50 }];
  const polaroidSavedResponse = await saveDraft(slug, 'premium-polaroid', cookie, polaroid.content, 0);
  assert.equal(polaroidSavedResponse.status, 200); const polaroidSaved = await polaroidSavedResponse.json();
  const polaroidPublishedResponse = await publication(cookie, { action: 'publish', expectedDraftRevision: polaroidSaved.revision, expectedPublicationId: basicPublished.id }, slug, 'premium-polaroid');
  assert.equal(polaroidPublishedResponse.status, 200); const polaroidPublished = (await polaroidPublishedResponse.json()).publication;
  const polaroidHtml = await (await request(`/${slug}`)).text(); assert.match(polaroidHtml, /data-publication-space="premium-polaroid"/); assert.match(polaroidHtml, /FLOW-POLAROID-PUBLISHED/);
  assert.equal((await request(`/api/public-sites/${slug}/assets/${assets[5]}/full`)).status, 200);
  const history = await (await request(publicationPath(), { cookie })).json();
  assert.equal(history.current.id, polaroidPublished.id);
  assert.deepEqual(new Set(history.history.map(row => row.space)), new Set(['basic', space, 'premium-polaroid']));
  assert.ok(history.history.every(row => row.draftRevision === 1), 'Equal revision numbers remain separate space identities');

  await runtime.pool.query('DELETE FROM site_template_grants WHERE site_id=$1 AND product=$2', [owner.siteId, space]);
  assert.equal((await request(publicationPath(), { cookie })).status, 403);
  assert.equal((await publication(cookie, { action: 'rollback', revisionId: first.id, expectedPublicationId: polaroidPublished.id })).status, 403);
  const revokedHistory = await (await request(publicationPath(slug, 'basic'), { cookie })).json();
  assert.equal(revokedHistory.current.id, polaroidPublished.id); assert.ok(revokedHistory.history.every(row => row.space !== space));
  assert.ok(!('content' in revokedHistory.current));
  assert.equal((await readPublished(runtime.pool, slug)).id, polaroidPublished.id);
  await grant(owner.siteId);
  assert.equal((await publication(cookie, { action: 'rollback', revisionId: first.id, expectedPublicationId: polaroidPublished.id }, slug, 'basic')).status, 404);
  const rollback = await publication(cookie, { action: 'rollback', revisionId: first.id, expectedPublicationId: polaroidPublished.id });
  assert.equal(rollback.status, 200); assert.equal((await rollback.json()).publication.id, first.id);
  assert.match(await (await request(`/${slug}`)).text(), /FLOW-PUBLISHED-TITLE/);
  assert.equal((await request(`/api/public-sites/${slug}/assets/${assets[1]}/full`)).status, 200);
  assert.equal((await request(publicAssetPath(assets[1]), { headers: { 'if-none-match': cachedFullEtag } })).status, 304, 'Rollback restores public membership and permits revalidation');
  assert.equal((await request(`/api/public-sites/${slug}/assets/${assets[5]}/full`)).status, 404);
  assert.equal((await publication(cookie, { action: 'rollback', revisionId: first.id, expectedPublicationId: polaroidPublished.id })).status, 409);
  assert.deepEqual(await readDraft(slug, space, cookie), nextDraft, 'Rollback retains the newer third-space draft');
  assert.deepEqual(await readDraft(slug, 'basic', cookie), savedBasic);
  assert.deepEqual(await readDraft(slug, 'premium-polaroid', cookie), polaroidSaved);
  assert.equal((await runtime.pool.query('SELECT count(*)::int AS n FROM site_publications WHERE site_id=$1', [owner.siteId])).rows[0].n, 1);
}

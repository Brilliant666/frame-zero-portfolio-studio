import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

const spaces = ['basic', 'premium-polaroid', 'premium-flow-gallery'];
const slug = 'fixtureone', otherSlug = 'fixturetwo';
const markers = { basic: 'PRODUCTION-BASIC-ONLY', 'premium-polaroid': 'PRODUCTION-POLAROID-ONLY', 'premium-flow-gallery': 'PRODUCTION-FLOW-ONLY' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const header = (response, name) => response.headers.get?.(name) ?? response.headers[name.toLowerCase()] ?? null;
function setCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const value = response.headers['set-cookie'] ?? header(response, 'set-cookie');
  return Array.isArray(value) ? value : String(value ?? '').split(/,(?=\s*(?:__Secure-|__Host-)?[A-Za-z0-9_.-]+=)/).filter(Boolean);
}
function status(response, expected, context) { assert.equal(response.status, expected, context); return response; }
async function safeFailure(response, password, context) {
  const text = await response.text();
  assert.ok(!text.includes(password), `${context}: no credential in response`);
  assert.ok(!/postgres(?:ql)?:\/\/|[A-Za-z]:[\\/]Users[\\/]|\/run\/secrets\/|\/var\/lib\/postgresql\//i.test(text), `${context}: no internal path or connection URI`);
}

/** Called only by the isolated production-image HTTPS harness, never the local runner. */
export async function productionSiteBusinessFlow({ request, pool, password, siteId, restartApp, recreateApp,
  setDatabaseAvailable, setAssetsAvailable, assertCleanupFailure, assertAbortedUploads }) {
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_site', 'Fixture writes require the dedicated disposable database');
  assert.equal((await pool.query('SELECT slug FROM sites WHERE id=$1', [siteId])).rows[0]?.slug, slug, 'Fixture Site ID is checked before HTTPS writes');
  assert.equal(typeof password, 'string');
  for (const callback of [request, restartApp, recreateApp, setDatabaseAvailable, setAssetsAvailable, assertCleanupFailure, assertAbortedUploads]) assert.equal(typeof callback, 'function');
  const draftPath = (space, name = slug) => `/api/sites/${name}/drafts/${space}`;
  const publicationPath = space => `/api/sites/${slug}/publications/${space}`;
  const privateAssets = `/api/sites/${slug}/assets`;
  const publicAsset = (id, variant = 'full') => `/api/public-sites/${slug}/assets/${id}/${variant}`;
  const getJson = async (url, cookie, context) => (await status(await request(url, { cookie }), 200, context).json());
  const login = async username => {
    const response = status(await request('/api/auth/sign-in/username', { method: 'POST', body: { username, password } }), 200, 'Production HTTPS login');
    const loginBody = await response.json();
    assert.ok(Boolean(loginBody) && typeof loginBody === 'object' && !Array.isArray(loginBody) && Object.keys(loginBody).length === 1 && loginBody.ok === true, 'Login body is exactly the non-sensitive success receipt');
    const cookies = setCookies(response);
    const session = cookies.find(value => value.split(';')[0].startsWith('__Secure-portfolio-site.session_token='));
    assert.ok(Boolean(session), 'Production host uses the separate secure session-cookie prefix');
    for (const attribute of [/;\s*Secure(?:;|$)/i, /;\s*HttpOnly(?:;|$)/i, /;\s*SameSite=Lax(?:;|$)/i, /;\s*Path=\/(?:;|$)/i]) assert.ok(attribute.test(session), 'Session cookie retains production security attributes');
    assert.ok(!/;\s*Domain=/i.test(session), 'Session cookie remains host-only');
    return cookies.map(value => value.split(';')[0]).join('; ');
  };
  const cookie = await login(slug), outsider = await login(otherSlug);
  const account = await getJson('/api/account/site', cookie, 'Owner account Site');
  assert.equal(account.site.id, siteId); assert.equal(account.site.slug, slug);
  assert.deepEqual([...account.templates.premium].sort(), ['premium-flow-gallery', 'premium-polaroid']);
  const otherAccount = await getJson('/api/account/site', outsider, 'Other account Site');
  assert.equal(otherAccount.site.slug, otherSlug); assert.deepEqual(otherAccount.templates.premium, []);
  const workbench = status(await request(`/${slug}/admin`, { cookie }), 200, 'Production Site workbench');
  const workbenchHtml = await workbench.text();
  for (const segment of ['basic', 'premium-polaroid', 'premium-flow-gallery']) assert.ok(workbenchHtml.includes(`/${slug}/admin/${segment}`), `Workbench exposes its authorized ${segment} editor`);
  for (const segment of ['premium-polaroid', 'premium-flow-gallery']) {
    status(await request(`/${slug}/admin/${segment}`, { cookie }), 200, `Authorized ${segment} editor`);
    status(await request(`/api/sites/${otherSlug}/drafts/${segment}`, { cookie: outsider }), 403, `No-grant ${segment} read`);
    status(await request(`/api/sites/${otherSlug}/drafts/${segment}`, { method: 'PUT', cookie: outsider, body: { expectedRevision: 0, content: {} } }), 403, `No-grant ${segment} save`);
    status(await request(`/api/sites/${otherSlug}/publications/${segment}`, { method: 'POST', cookie: outsider, body: { action: 'publish', expectedDraftRevision: 1, expectedPublicationId: null } }), 403, `No-grant ${segment} publish`);
  }

  const uploads = [];
  const upload = (bytes, actor = cookie, name = slug) => request(`/api/sites/${name}/assets`, { method: 'POST', cookie: actor, headers: { 'content-type': 'image/png', 'x-file-name': 'generated-production-fixture.png' }, body: bytes });
  for (const [index, width, height] of [[1, 96, 64], [2, 64, 96], [3, 80, 80]]) {
    const bytes = await sharp({ create: { width, height, channels: 3, background: `#34567${index}` } }).png().toBuffer();
    const response = status(await upload(bytes), 201, 'HTTPS generated-image upload');
    const asset = (await response.json()).asset;
    assert.ok(asset.id && asset.variants.card && asset.variants.full);
    assert.equal(JSON.stringify(asset).includes('original.'), false, 'Library DTO does not leak original storage keys');
    const original = status(await request(`${privateAssets}/${asset.id}/original`, { cookie }), 200, 'Owner original image');
    assert.equal(digest(original.bytes), digest(bytes), 'Original bytes remain intact');
    for (const variant of ['thumbnail', 'card', 'full']) {
      const image = status(await request(asset.variants[variant].src, { cookie }), 200, `Owner ${variant} variant`);
      assert.match(header(image, 'cache-control') ?? '', /private/);
      const metadata = await sharp(image.bytes).metadata();
      assert.equal(metadata.format, 'webp');
      assert.equal(metadata.width, asset.variants[variant].width); assert.equal(metadata.height, asset.variants[variant].height);
    }
    uploads.push({ asset, bytes });
  }
  const duplicate = await upload(uploads[0].bytes); status(duplicate, 200, 'Same-Site deduplication');
  assert.equal((await duplicate.json()).asset.id, uploads[0].asset.id);
  const foreignResponse = status(await upload(uploads[0].bytes, outsider, otherSlug), 201, 'Other Site owns an independent copy');
  const foreignAsset = (await foreignResponse.json()).asset;
  assert.notEqual(foreignAsset.id, uploads[0].asset.id);
  const rows = (await pool.query('SELECT id,digest,variants FROM site_assets WHERE site_id=$1 ORDER BY id', [siteId])).rows;
  assert.equal(rows.length, 3, 'Uploads enter only the owning Site');
  for (const { asset, bytes } of uploads) {
    const stored = rows.find(row => row.id === asset.id); assert.equal(stored.digest, digest(bytes));
    assert.equal(stored.variants.original.key, `${siteId}/${asset.id}/original.png`, 'Stored keys stay relative and stable');
  }
  for (const [actor, expected] of [[undefined, 401], [outsider, 403]]) {
    status(await request(privateAssets, { cookie: actor }), expected, 'Private library authorization');
    status(await request(uploads[0].asset.variants.full.src, { cookie: actor }), expected, 'Private variant authorization');
    status(await request(draftPath('basic'), { cookie: actor }), expected, 'Private draft authorization');
  }
  status(await request(`/api/sites/${otherSlug}/assets/${uploads[0].asset.id}/full`, { cookie: outsider }), 404, 'Asset identity cannot cross Sites');

  const documents = {}, saved = {};
  for (const space of spaces) {
    const empty = await getJson(draftPath(space), cookie, `Read initial ${space} draft`);
    assert.equal(empty.revision, 0, 'Disposable fixture starts without saved content'); documents[space] = structuredClone(empty.content);
  }
  const basic = documents.basic;
  basic.profile.brand = basic.profile.photographer = basic.hero.title = markers.basic;
  const work = (upload, index) => ({ assetId: upload.asset.id, code: 'FIXTURE', title: `Generated work ${index}`, subtitle: '', image: '', preview: '', position: '50% 50%', previewWidth: upload.asset.variants.card.width, previewHeight: upload.asset.variants.card.height, fullWidth: upload.asset.variants.full.width, enabled: true, slotIndex: index, locked: false });
  basic.works = uploads.slice(0, 2).map(work); basic.templateWorks[basic.activeTemplate] = structuredClone(basic.works);
  const premium = documents['premium-polaroid'];
  premium.profile.brand = premium.profile.photographer = premium.hero.title = markers['premium-polaroid'];
  premium.collections = [{ id: randomUUID(), name: markers['premium-polaroid'], description: 'Generated photography only', visible: true, assetIds: uploads.slice(0, 2).map(item => item.asset.id), coverAssetId: uploads[0].asset.id, focusAssetId: uploads[1].asset.id, coverFit: 'natural', coverFocusX: 50, coverFocusY: 50 }];
  const flow = documents['premium-flow-gallery'], groupId = randomUUID();
  flow.profile = { brand: markers['premium-flow-gallery'], title: markers['premium-flow-gallery'], intro: 'Generated production fixture' };
  flow.background.assetId = uploads[0].asset.id;
  flow.groups = [{ id: groupId, name: markers['premium-flow-gallery'], assetIds: [uploads[1].asset.id, uploads[0].asset.id], captions: {}, visible: true }];
  flow.rails = { leftGroupId: groupId, rightGroupId: null };
  const save = (space, content, expectedRevision, options = {}) => request(draftPath(space), { method: 'PUT', cookie, body: { content, expectedRevision }, ...options });
  for (const space of spaces) {
    const response = status(await save(space, documents[space], 0), 200, `Save ${space} draft`);
    saved[space] = await response.json(); assert.equal(saved[space].revision, 1);
    assert.deepEqual(saved[space].content, documents[space], `${space} save preserves exact owned relationships`);
    assert.deepEqual(await getJson(draftPath(space), cookie, `${space} refresh`), saved[space]);
    const preview = status(await request(`/${slug}/admin/preview/${space}`, { cookie }), 200, `${space} private preview`);
    assert.match(header(preview, 'cache-control') ?? '', /private/); assert.ok((await preview.text()).includes(markers[space]), 'Owner can preview saved unpublished content');
    const anonymousPreview = await request(`/${slug}/admin/preview/${space}`);
    assert.ok([302, 303, 307, 308].includes(anonymousPreview.status), 'Anonymous preview redirects to login');
    assert.equal(new URL(header(anonymousPreview, 'location'), 'https://fixture.invalid').pathname, '/login');
    assert.ok(!(await anonymousPreview.text()).includes(markers[space]));
    status(await request(`/${slug}/admin/preview/${space}`, { cookie: outsider }), 404, 'Another Site cannot preview owner content');
    const forged = structuredClone(documents[space]);
    if (space === 'basic') { forged.works[0].assetId = foreignAsset.id; forged.templateWorks[forged.activeTemplate][0].assetId = foreignAsset.id; }
    else if (space === 'premium-polaroid') forged.collections[0].coverAssetId = foreignAsset.id;
    else forged.background.assetId = foreignAsset.id;
    status(await save(space, forged, 1), 422, `${space} refuses a foreign asset reference`);
    assert.deepEqual(await getJson(draftPath(space), cookie, `${space} after refused foreign reference`), saved[space]);
  }
  const unpublished = status(await request(`/${slug}`), 200, 'Unpublished Site remains known');
  const unpublishedHtml = await unpublished.text(); assert.ok(/data-site-state="unpublished"/.test(unpublishedHtml), 'Unpublished Site renders the fixed unpublished state');
  for (const marker of Object.values(markers)) assert.ok(!unpublishedHtml.includes(marker), 'Saving never exposes private draft content');
  status(await request(publicAsset(uploads[0].asset.id)), 404, 'Unpublished media remains private');

  let pointer = null;
  const publications = {};
  const publish = (space, revision, expectedPublicationId = pointer) => request(publicationPath(space), { method: 'POST', cookie, body: { action: 'publish', expectedDraftRevision: revision, expectedPublicationId } });
  for (const space of spaces) {
    status(await publish(space, 2), 409, 'Publishing an unsaved revision is rejected');
    const response = status(await publish(space, 1), 200, `Explicit ${space} publish`);
    const publication = (await response.json()).publication; assert.equal(publication.space, space); assert.equal(publication.draftRevision, 1);
    pointer = publication.id; publications[space] = publication;
    const page = status(await request(`/${slug}`), 200, `${space} anonymous public page`);
    const html = await page.text(); assert.ok(html.includes(`data-publication-space="${space}"`)); assert.ok(html.includes(`data-publication-id="${pointer}"`));
    assert.ok(html.includes(markers[space]), `${space} renders the explicit publication`);
    for (const other of spaces.filter(item => item !== space)) assert.ok(!html.includes(markers[other]), 'Published-only page does not merge independent content spaces');
    for (const { asset } of uploads.slice(0, 2)) {
      const visible = status(await request(publicAsset(asset.id)), 200, 'Published variant is anonymously readable');
      const owner = status(await request(asset.variants.full.src, { cookie }), 200, 'Owner still reads the same variant');
      assert.equal(digest(visible.bytes), digest(owner.bytes));
    }
    status(await request(publicAsset(uploads[2].asset.id)), 404, 'Unused library image is not made public');
    status(await request(publicAsset(uploads[0].asset.id, 'original')), 404, 'Original is never served by the public media API');
  }
  const history = await getJson(publicationPath('basic'), cookie, 'Publication history');
  assert.equal(history.current.id, pointer);
  for (const space of spaces) assert.ok(history.history.some(item => item.id === publications[space].id && item.space === space));
  const unchanged = status(await publish('premium-flow-gallery', 1), 200, 'Repeat identical publication');
  assert.equal((await unchanged.json()).publication.id, pointer, 'Identical publish reuses the exact snapshot');
  assert.equal((await getJson(publicationPath('basic'), cookie, 'History after unchanged publish')).history.length, history.history.length);

  const changed = structuredClone(flow), privateChange = 'PRODUCTION-FLOW-PRIVATE-CHANGE'; changed.profile.title = privateChange;
  saved['premium-flow-gallery'] = await status(await save('premium-flow-gallery', changed, 1), 200, 'Modify current Flow draft').json();
  assert.equal(saved['premium-flow-gallery'].revision, 2);
  status(await save('premium-flow-gallery', flow, 1), 409, 'Stale CAS cannot overwrite the new draft');
  for (const space of ['basic', 'premium-polaroid']) assert.deepEqual(await getJson(draftPath(space), cookie, 'Independent draft after Flow change'), saved[space]);
  assert.ok(!(await (await request(`/${slug}`)).text()).includes(privateChange), 'Modified draft remains private before another publish');
  status(await publish('premium-flow-gallery', 2, null), 409, 'Stale Published pointer prevents replacement');
  const next = (await status(await publish('premium-flow-gallery', 2), 200, 'Publish changed Flow snapshot').json()).publication;
  assert.notEqual(next.id, pointer);
  assert.ok((await (await request(`/${slug}`)).text()).includes(privateChange), 'Explicit changed publication appears anonymously');
  const rollback = status(await request(publicationPath('premium-flow-gallery'), { method: 'POST', cookie, body: { action: 'rollback', revisionId: pointer, expectedPublicationId: next.id } }), 200, 'Rollback to the retained Flow snapshot');
  assert.equal((await rollback.json()).publication.id, pointer);
  assert.ok(!(await (await request(`/${slug}`)).text()).includes(privateChange), 'Rollback restores the previous snapshot');
  assert.deepEqual(await getJson(draftPath('premium-flow-gallery'), cookie, 'Draft after rollback'), saved['premium-flow-gallery'], 'Rollback never rewrites the current draft');
  status(await request(publicationPath('basic'), { method: 'POST', cookie, body: { action: 'rollback', revisionId: pointer, expectedPublicationId: pointer } }), 404, 'A snapshot cannot be rolled back through a different space');
  status(await publish('premium-flow-gallery', 2, next.id), 409, 'A stale pointer still fails after rollback');

  for (const options of [{ origin: 'https://attacker.invalid' }, { origin: false }, { headers: { 'sec-fetch-site': 'cross-site' } }]) {
    status(await save('basic', basic, 1, options), 403, 'Write Origin and fetch-site boundary');
  }
  for (const [path, maximum] of [['/api/auth/sign-in/username', 2048], [publicationPath('basic'), 2048], [draftPath('basic'), 512000]]) {
    status(await request(path, { method: path.includes('/drafts/') ? 'PUT' : 'POST', cookie, headers: { 'content-type': 'application/json' }, body: Buffer.alloc(maximum + 1, 120) }), 413, 'HTTPS JSON body limit is enforced before parsing');
  }
  const spoofedHeaders = { forwarded: 'for=127.0.0.1;proto=https;host=attacker.invalid', 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'https', 'x-account-local-proof': 'forged', 'x-portfolio-proxy-proof': 'forged', 'x-account-user-id': siteId, 'x-site-id': siteId };
  assert.ok([401, 403].includes((await request('/api/account/site', { headers: spoofedHeaders })).status), 'Client forwarding or proof headers cannot create a session');
  status(await request(draftPath('basic'), { cookie: outsider, headers: spoofedHeaders }), 403, 'Spoofed headers cannot change Site ownership');
  status(await request('/api/account/site', { cookie, headers: { host: 'attacker.invalid', 'x-forwarded-host': 'localhost:3000' } }), 421, 'TLS SNI and raw Host mismatch is rejected before virtual-host routing');
  status(await request('/api/account/site', { cookie, headers: { host: 'portfolio.test:1' } }), 403, 'Matching SNI with a noncanonical Host port is still rejected');
  for (const path of ['/test', '/test/admin', '/admin', '/preview/admin', '/api/site-content', '/api/preview/site-content', '/photos/library-manifest.json', '/api/auth/sign-up/email']) {
    const response = await request(path, { cookie }); assert.ok(response.status >= 400 && response.status < 500, 'Legacy and internal routes remain closed');
  }

  const cleanupProof = await assertCleanupFailure({ cookie, bytes: uploads[0].bytes, siteId });
  const abortProof = await assertAbortedUploads({ cookie, bytes: uploads[0].bytes });
  assert.ok(cleanupProof && typeof cleanupProof === 'object'); assert.ok(abortProof && typeof abortProof === 'object');
  const libraryBefore = await getJson(privateAssets, cookie, 'Library before restart');
  const snapshot = async () => ({
    drafts: (await pool.query('SELECT space,content,revision FROM site_content_drafts WHERE site_id=$1 ORDER BY space', [siteId])).rows,
    assets: (await pool.query('SELECT id,digest,variants FROM site_assets WHERE site_id=$1 ORDER BY id', [siteId])).rows,
    pointer: (await pool.query('SELECT revision_id FROM site_publications WHERE site_id=$1', [siteId])).rows,
    history: (await pool.query('SELECT id,space,draft_revision,content,asset_ids FROM site_publication_revisions WHERE site_id=$1 ORDER BY id', [siteId])).rows,
  });
  const before = await snapshot();
  const waitReady = async context => {
    const deadline = Date.now() + 20_000; let last;
    do {
      try { last = await request('/api/health/ready'); if (last.status === 200) return; } catch { /* A bounded restart gap is expected. */ }
      await new Promise(resolve => setTimeout(resolve, 150));
    } while (Date.now() < deadline);
    assert.equal(last?.status, 200, context);
  };
  for (const [name, restart] of [['restart', restartApp], ['container recreation', recreateApp]]) {
    await restart(); await waitReady(`${name}: readiness recovers`);
    assert.deepEqual(await snapshot(), before, `${name}: database identities, drafts, history and pointer persist`);
    assert.deepEqual(await getJson(privateAssets, cookie, `${name}: same persisted session and library`), libraryBefore);
    for (const space of spaces) assert.deepEqual(await getJson(draftPath(space), cookie, `${name}: ${space} persists`), saved[space]);
    for (const { asset, bytes } of uploads) assert.equal(digest(status(await request(`${privateAssets}/${asset.id}/original`, { cookie }), 200, `${name}: original read`).bytes), digest(bytes));
    const page = status(await request(`/${slug}`), 200, `${name}: Published page persists`);
    assert.ok((await page.text()).includes(`data-publication-id="${pointer}"`));
    status(await request(publicAsset(uploads[0].asset.id)), 200, `${name}: Published image persists`);
  }
  for (const [name, toggle] of [['database', setDatabaseAvailable], ['assets', setAssetsAvailable]]) {
    try {
      await toggle(false);
      const notReady = status(await request('/api/health/ready'), 503, `${name} outage readiness`);
      assert.deepEqual(await notReady.json(), { status: 'not_ready' }, 'Readiness reveals no dependency configuration');
      status(await request('/api/health/live'), 200, `${name} outage retains liveness`);
      const failed = name === 'database' ? await request('/api/account/site', { cookie }) : await request(publicAsset(uploads[0].asset.id));
      status(failed, 503, `${name} outage reports unavailable`); await safeFailure(failed, password, name);
    } finally { await toggle(true); }
    await waitReady(`${name} restoration: readiness recovers`);
  }
  assert.deepEqual(await snapshot(), before, 'Dependency failure probes never change business content');
  const secondSession = await login(slug);
  status(await request('/api/auth/revoke-sessions', { method: 'POST', cookie, body: {} }), 200, 'Production session revocation');
  status(await request('/api/account/site', { cookie }), 401, 'Revoked original session is rejected');
  status(await request('/api/account/site', { cookie: secondSession }), 401, 'Revoked second session is rejected');
  status(await request('/api/auth/sign-out', { method: 'POST', cookie: outsider, body: {} }), 200, 'Production logout');
  status(await request('/api/account/site', { cookie: outsider }), 401, 'Logged-out session is rejected');
  status(await request(`/${slug}`), 200, 'Published content remains public after logout');
  return { transport: 'isolated-https', secureSessionCookie: true, spaces, generatedImages: uploads.length,
    originalIntegrity: true, privatePreview: true, publishedOnly: true, casConflict: true, publicationHistoryAndRollback: true,
    ownershipAndGrantRejections: true, hostOriginAndSpoofingRejections: true, requestLimits: true,
    cleanupFailureAndAbortChecks: true, appRestartAndContainerRecreation: true, databaseAndAssetsReadinessFailures: true, sessionRevocationAndLogout: true };
}

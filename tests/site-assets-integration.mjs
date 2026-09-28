import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { provisionAccount } from '../db/accounts/provision.mjs';

export async function siteAssetsIntegration({ runtime, origin, password, restart }) {
  for (const [name, premium] of [['fixtureasseta', true], ['fixtureassetb', false]]) await provisionAccount(runtime, { username: name, slug: name, email: `${name}@assets.example`, password, premium });
  const req = (url, cookie, options = {}) => fetch(`${origin}${url}`, { signal: AbortSignal.timeout(30000), ...options, headers: { origin, ...(cookie ? { cookie } : {}), ...options.headers } });
  const login = async name => { const r = await req('/api/auth/sign-in/username', null, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password }) }); assert.equal(r.status, 200); return r.headers.getSetCookie().map(s => s.split(';')[0]).join('; '); };
  let a = await login('fixtureasseta'); const b = await login('fixtureassetb');
  const endpoint = '/api/sites/fixtureasseta/assets';
  const uploads = [];
  const upload = (bytes, cookie = a, name = 'anonymous.png', slug = 'fixtureasseta') => req(`/api/sites/${slug}/assets`, cookie, { method: 'POST', headers: { 'content-type': 'image/png', 'x-file-name': encodeURIComponent(name) }, body: bytes });
  for (const [width, height] of [[900, 600], [600, 900], [600, 600]]) {
    const bytes = await sharp({ create: { width, height, channels: 3, background: '#6489ac' } }).png().toBuffer();
    const r = await upload(bytes); assert.equal(r.status, 201); const { asset } = await r.json(); uploads.push({ asset, bytes });
    const original = await req(`${endpoint}/${asset.id}/original`, a); assert.equal(original.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
    for (const name of ['thumbnail', 'card', 'full']) { const image = await req(asset.variants[name].src, a); assert.equal(image.status, 200); assert.match(image.headers.get('cache-control'), /private/); }
  }
  const duplicate = await upload(uploads[0].bytes); assert.equal(duplicate.status, 200); const dup = await duplicate.json(); assert.equal(dup.deduplicated, true); assert.equal(dup.asset.id, uploads[0].asset.id);
  const otherUpload = await upload(uploads[0].bytes, b, 'same.png', 'fixtureassetb'); assert.equal(otherUpload.status, 201); const otherAsset = (await otherUpload.json()).asset; assert.notEqual(otherAsset.id, uploads[0].asset.id);
  assert.equal((await upload(Buffer.from('corrupt'))).status, 400);
  assert.equal((await upload(Buffer.alloc(25 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await upload(uploads[0].bytes, a, '../bad.png')).status, 400);
  const before = await (await req(endpoint, a)).json(); assert.equal(before.assets.length, 3);
  for (const cookie of [undefined, b]) {
    const status = cookie ? 403 : 401;
    for (const url of [endpoint, `${endpoint}/${uploads[0].asset.id}`, uploads[0].asset.variants.full.src]) for (const method of url === endpoint ? ['GET'] : ['GET', 'HEAD']) assert.equal((await req(url, cookie, { method })).status, status);
    assert.equal((await req(uploads[0].asset.variants.full.src, cookie, { headers: { range: 'bytes=0-20' } })).status, status);
  }
  assert.equal((await req(uploads[0].asset.variants.full.src, a, { method: 'HEAD' })).status, 200);
  assert.equal((await req(uploads[0].asset.variants.full.src, a, { headers: { range: 'bytes=0-20' } })).status, 416);
  assert.equal((await req(`/api/sites/fixtureassetb/assets/${uploads[0].asset.id}/full`, b)).status, 404);
  for (const url of ['/photos/library-manifest.json', '/api/site-content', '/api/preview/site-content', '/preview/admin', '/admin', '/api/platform-qr/' + 'a'.repeat(64)]) for (const cookie of [undefined, b]) assert.ok((await req(url, cookie)).status >= 400, `${url} legacy bypass denied`);

  const draft = async space => { const r = await req(`/api/sites/fixtureasseta/drafts/${space}`, a); assert.equal(r.status, 200); return r.json(); };
  const save = (space, content, revision, cookie = a, slug = 'fixtureasseta') => req(`/api/sites/${slug}/drafts/${space}`, cookie, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, expectedRevision: revision }) });
  const basic = (await draft('basic')).content; const premium = (await draft('premium-polaroid')).content;
  const work = { assetId: uploads[0].asset.id, code: 'PHOTO', title: 'Shared asset', subtitle: '', image: '', preview: '', position: '40% 60%', previewWidth: 900, previewHeight: 600, fullWidth: 900, enabled: true, slotIndex: 0, locked: false };
  basic.profile.photographer = 'Basic asset photographer'; basic.works = [work]; basic.templateWorks['cinematic-light'] = [work]; basic.social = [{ label: 'Card', handle: '', qrAssetId: uploads[1].asset.id }];
  premium.profile.photographer = 'Premium asset photographer'; premium.collections = [{ id: randomUUID(), name: 'Shared photos', description: '', visible: true, assetIds: uploads.map(u => u.asset.id), coverAssetId: uploads[0].asset.id, focusAssetId: uploads[1].asset.id, coverFit: 'natural', coverFocusX: 50, coverFocusY: 50 }]; premium.social = [{ label: 'Card', handle: '', qrAssetId: uploads[1].asset.id }];
  assert.equal((await save('basic', basic, 0)).status, 200); assert.equal((await draft('premium-polaroid')).revision, 0);
  assert.equal((await save('premium-polaroid', premium, 0)).status, 200); assert.equal((await draft('basic')).revision, 1);
  assert.equal((await save('basic', basic, 0)).status, 409);
  for (const mutate of [c => { c.works[0].assetId = otherAsset.id; }, c => { c.templateWorks['cinematic-light'][0].assetId = otherAsset.id; }, c => { c.social[0].qrAssetId = otherAsset.id; }]) { const copy = structuredClone(basic); mutate(copy); assert.equal((await save('basic', copy, 1)).status, 422); }
  for (const key of ['assetIds', 'coverAssetId', 'focusAssetId']) { const copy = structuredClone(premium); if (key === 'assetIds') copy.collections[0].assetIds.push(otherAsset.id); else { copy.collections[0][key] = otherAsset.id; if (key === 'focusAssetId') copy.collections[0].assetIds.push(otherAsset.id); } assert.equal((await save('premium-polaroid', copy, 1)).status, 422); }
  const qr = structuredClone(premium); qr.social[0].qrAssetId = otherAsset.id; assert.equal((await save('premium-polaroid', qr, 1)).status, 422);
  assert.equal((await save('premium-polaroid', premium, 0, b, 'fixtureassetb')).status, 403);
  assert.equal((await save('basic', basic, 1, b)).status, 403);
  for (const space of ['basic', 'premium-polaroid']) { const r = await req(`/fixtureasseta/admin/preview/${space}`, a); assert.equal(r.status, 200); }
  const publicHtml = await (await req('/fixtureasseta')).text(); assert.match(publicHtml, /unpublished/); assert.doesNotMatch(publicHtml, /Shared photos|Shared asset|api\/sites\/fixtureasseta\/assets/);
  await restart(); a = await login('fixtureasseta'); assert.deepEqual((await draft('basic')).content, basic); assert.deepEqual((await draft('premium-polaroid')).content, premium); assert.deepEqual((await (await req(endpoint, a)).json()).assets, before.assets);
  await runtime.pool.query('UPDATE "session" SET expires_at=timezone(\'UTC\',now())-interval \'1 minute\' WHERE user_id=(SELECT id FROM "user" WHERE username=$1)', ['fixtureasseta']);
  assert.equal((await req(endpoint, a)).status, 401); assert.equal((await req(uploads[0].asset.variants.full.src, a, { method: 'HEAD' })).status, 401); assert.equal((await upload(uploads[0].bytes)).status, 401);
}

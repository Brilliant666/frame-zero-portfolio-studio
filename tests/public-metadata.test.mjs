import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function load(file, dependencies = {}) {
  const source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URL, require(id) { if (Object.hasOwn(dependencies, id)) return dependencies[id]; throw Error(`Unexpected dependency ${id}`); } });
  return exports;
}
const title = await load('app/client-visible-title.ts');
const { publishedSiteMetadata } = await load('app/site-editor/public-metadata.ts', { '../client-visible-title': title });
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const HIDDEN = '33333333-3333-4333-8333-333333333333';
const asset = (id, slug = 'metafixture') => ({ id, variants: { card: { src: `/api/public-sites/${slug}/assets/${id}/card`, width: 800, height: 1200 } } });
const flow = (overrides = {}) => ({ slug: 'metafixture', space: 'premium-flow-gallery', assetIds: [ID], content: {
  profile: { brand: ' Published brand ', title: 'Homepage section title', intro: 'Published intro' },
  background: { assetId: ID }, groups: [],
}, ...overrides });
const plain = value => JSON.parse(JSON.stringify(value));

test('flow metadata uses Published brand and trusted configured origin; homepage title is unchanged', () => {
  const snapshot = flow(), before = JSON.stringify(snapshot);
  const metadata = publishedSiteMetadata(snapshot, [asset(ID)], 'https://portfolio.example');
  assert.deepEqual(plain(metadata.title), { absolute: 'Published brand' });
  assert.equal(metadata.openGraph.title, 'Published brand');
  assert.equal(metadata.openGraph.siteName, 'Published brand');
  assert.equal(metadata.openGraph.url, 'https://portfolio.example/metafixture');
  assert.equal(metadata.alternates.canonical, metadata.openGraph.url);
  assert.equal(metadata.openGraph.images[0].url, `https://portfolio.example/api/public-sites/metafixture/assets/${ID}/card`);
  assert.equal(metadata.twitter.card, 'summary_large_image');
  assert.equal(metadata.twitter.images[0].width, 800);
  assert.equal(JSON.stringify(snapshot), before, 'Metadata must not mutate the homepage content');
});

test('metadata rejects foreign, private and non-Published images and falls back to a visible Published photo', () => {
  const snapshot = flow({ assetIds: [ID, HIDDEN], content: { profile: flow().content.profile, background: { assetId: OTHER },
    groups: [{ visible: false, assetIds: [HIDDEN] }, { visible: true, assetIds: [OTHER, ID] }] } });
  let metadata = publishedSiteMetadata(snapshot, [asset(OTHER), asset(HIDDEN), asset(ID)], 'http://127.0.0.1:3004');
  assert.ok(metadata.openGraph.images[0].url.endsWith(`/${ID}/card`));
  for (const unsafe of [`/api/sites/metafixture/assets/${ID}/card`, `https://foreign.example/${ID}.webp`, '/og.png', asset(ID, 'otherfixture').variants.card.src]) {
    metadata = publishedSiteMetadata(snapshot, [{ ...asset(ID), variants: { card: { ...asset(ID).variants.card, src: unsafe } } }], 'http://127.0.0.1:3004');
    assert.equal(metadata.openGraph.images.length, 0);
    assert.equal(metadata.twitter.images.length, 0);
    assert.equal(metadata.twitter.card, 'summary');
  }
});

test('each Site owns its metadata and missing brand or photos do not inherit legacy defaults', () => {
  const snapshot = flow({ slug: 'secondfixture', content: { profile: { brand: '', title: 'Not the brand', intro: '' }, background: { assetId: null }, groups: [] } });
  const metadata = publishedSiteMetadata(snapshot, [asset(ID)], 'https://portfolio.example');
  assert.equal(metadata.title.absolute, '摄影作品集');
  assert.equal(metadata.openGraph.siteName, '摄影作品集');
  assert.equal(metadata.openGraph.url, 'https://portfolio.example/secondfixture');
  assert.equal(metadata.openGraph.images.length, 0);
  for (const invalid of ['javascript:alert(1)', 'file:///tmp/', 'https://user:placeholder@example.invalid', 'https://example.com/path', 'https://example.com/?redirect=bad']) {
    assert.throws(() => publishedSiteMetadata(snapshot, [], invalid), /Invalid public metadata origin/);
  }
  assert.throws(() => publishedSiteMetadata({ ...snapshot, slug: '../star' }, [], 'https://portfolio.example'), /Invalid public metadata Site slug/);
});

test('basic and polaroid preserve their title rules and choose only enabled or visible Published works', () => {
  const profile = { brand: ' Photographer ', photographer: 'Fallback', mark: '', intro: 'Intro' };
  const basic = { slug: 'metafixture', space: 'basic', assetIds: [ID, HIDDEN], content: { profile, activeTemplate: 'archive-os', works: [{ enabled: true, assetId: HIDDEN }], templateWorks: { 'archive-os': [{ enabled: false, assetId: HIDDEN }, { enabled: true, assetId: ID }] } } };
  const polaroid = { ...basic, space: 'premium-polaroid', content: { profile, collections: [{ visible: false, coverAssetId: HIDDEN, assetIds: [HIDDEN] }, { visible: true, coverAssetId: ID, assetIds: [ID] }] } };
  for (const snapshot of [basic, polaroid]) {
    const metadata = publishedSiteMetadata(snapshot, [asset(ID), asset(HIDDEN)], 'https://portfolio.example');
    assert.equal(metadata.title.absolute, 'Photographer的作品集');
    assert.ok(metadata.openGraph.images[0].url.endsWith(`/${ID}/card`));
  }
});

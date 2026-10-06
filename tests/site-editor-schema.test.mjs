import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function schema(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'site-editor-schema-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, sourcePath] of [['catalog', 'templates/catalog'], ['document', 'preview-workspace/document'], ['flow', 'site-editor/flow-gallery-document'], ['schema', 'site-editor/content-schema']]) {
    const source = await fs.readFile(new URL(`../app/${sourcePath}.ts`, import.meta.url), 'utf8');
    // site-config reexports these exact catalog functions. Avoid loading its
    // unrelated legacy photo defaults in this pure schema unit test.
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace('"../site-config"', '"./catalog.mjs"').replace('"../preview-workspace/document"', '"./document.mjs"').replace('"./flow-gallery-document"', '"./flow.mjs"');
    await fs.writeFile(path.join(directory, `${name}.mjs`), js);
  }
  return { ...await import(pathToFileURL(path.join(directory, 'schema.mjs'))), ...await import(pathToFileURL(path.join(directory, 'document.mjs'))), ...await import(pathToFileURL(path.join(directory, 'flow.mjs'))) };
}

test('Site spaces have empty independent defaults and lossless separate schemas', async t => {
  const m = await schema(t);
  const basic = m.createEmptyBasicContent(), premium = m.createEmptyPreviewDocument();
  assert.deepEqual(m.parseSpaceContent('basic', basic), basic);
  assert.deepEqual(m.parseSpaceContent('premium-polaroid', premium), premium);
  assert.equal(basic.profile.photographer, '');
  assert.equal(premium.contact.email, '');
  assert.equal(Object.keys(basic.templateWorks).length, 11);
  assert.deepEqual(Object.keys(basic).sort(), ['activeTemplate', 'bookingFields', 'contact', 'hero', 'packages', 'profile', 'social', 'statement', 'templateWorks', 'trustItems', 'works'].sort());
  for (const key of Object.keys(basic)) {
    const incomplete = structuredClone(basic); delete incomplete[key];
    assert.throws(() => m.parseSpaceContent('basic', incomplete), `Basic requires its own ${key} field`);
  }
  for (const extra of ['schemaVersion', 'collections', 'futurePremiumSetting']) {
    assert.throws(() => m.parseSpaceContent('basic', { ...basic, [extra]: null }));
  }
  basic.profile.photographer = 'Independent basic';
  basic.packages = [{ number: '01', english: 'Basic', name: 'Basic package', description: '', price: '100', duration: '', deliverables: [], enabled: true }];
  assert.equal(premium.profile.photographer, '');
  assert.deepEqual(premium.packages, []);
  assert.deepEqual(m.parseSpaceContent('basic', basic), basic);
  assert.throws(() => m.parseSpaceContent('basic', premium));
  assert.throws(() => m.parseSpaceContent('premium-polaroid', basic));
});

const flowId = n => `a1234567-1234-4234-8234-${String(n).padStart(12, '0')}`;
function filledFlow(m) {
  const d = m.createEmptyFlowGalleryDocument();
  d.background.assetId = flowId(1);
  d.groups = [{ id: flowId(10), name: 'First', assetIds: [flowId(2), flowId(3)], captions: { [flowId(3)]: 'Caption' }, visible: true }, { id: flowId(11), name: 'Second', assetIds: [flowId(3)], captions: {}, visible: false }];
  d.rails = { leftGroupId: flowId(11), rightGroupId: flowId(10) };
  d.pricing = { enabled: true, heading: 'Packages', introduction: '', packages: [{ id: flowId(20), name: 'Session', price: '100', description: '', details: ['Detail'], enabled: true }] };
  d.contact = { enabled: true, heading: 'Contact', intro: '', items: [{ id: flowId(30), label: 'Email', value: '', href: 'mailto:example@example.invalid', qrAssetId: flowId(4) }] };
  return d;
}

test('flow space is empty, independent and mutually exclusive with both existing contracts', async t => {
  const m = await schema(t), flow = m.createEmptyFlowGalleryDocument();
  assert.deepEqual(m.parseSpaceContent('premium-flow-gallery', flow), flow);
  assert.deepEqual(m.contentAssetIds('premium-flow-gallery', flow), []);
  assert.equal(flow.profile.title, ''); assert.equal(flow.background.assetId, null);
  assert.equal(flow.pricing.enabled, false); assert.equal(flow.contact.enabled, false);
  assert.equal(m.isContentSpace('premium-flow-gallery'), true); assert.equal(m.isContentSpace('proof'), false);
  const spaces = { basic: m.createEmptyBasicContent(), 'premium-polaroid': m.createEmptyPreviewDocument(), 'premium-flow-gallery': flow };
  for (const [space, content] of Object.entries(spaces)) for (const [otherSpace, otherContent] of Object.entries(spaces)) {
    if (space === otherSpace) assert.deepEqual(m.parseSpaceContent(space, content), content);
    else assert.throws(() => m.parseSpaceContent(space, otherContent), `${space} rejects ${otherSpace}`);
  }
  const d = filledFlow(m), before = structuredClone(d), parsed = m.parseFlowGalleryDocument(d);
  assert.deepEqual(parsed, before); assert.deepEqual(d, before);
  assert.deepEqual(parsed.groups.map(g => g.id), [flowId(10), flowId(11)]);
  assert.deepEqual(parsed.groups[0].assetIds, [flowId(2), flowId(3)]);
  assert.deepEqual(parsed.rails, { leftGroupId: flowId(11), rightGroupId: flowId(10) });
  assert.deepEqual(m.contentAssetIds('premium-flow-gallery', parsed), [flowId(1), flowId(2), flowId(3), flowId(4)]);
});

test('flow parser rejects malformed identities, unsafe URLs, unknown fields and broken relationships', async t => {
  const m = await schema(t), original = filledFlow(m);
  for (const change of [
    d => d.schemaVersion = 2, d => d.collections = [], d => delete d.profile.brand,
    d => d.profile.extra = 'hidden', d => d.background.assetId = '/photos/private.jpg',
    d => d.background.assetId = 'a'.repeat(64), d => d.background.focalPoint.x = 101,
    d => d.background.focalPoint.y = NaN, d => d.groups[0].id = 'local-group',
    d => d.groups.push(structuredClone(d.groups[0])), d => d.groups[0].name = ' ',
    d => d.groups[0].assetIds.push(flowId(2).toUpperCase()),
    d => d.groups[0].captions[flowId(99)] = 'Not a member',
    d => d.groups[0].captions[flowId(3).toUpperCase()] = 'Duplicate spelling',
    d => d.rails.leftGroupId = flowId(99), d => d.pricing.enabled = 'true',
    d => d.pricing.packages.push(structuredClone(d.pricing.packages[0])),
    d => d.contact.items.push(structuredClone(d.contact.items[0])),
    d => d.contact.items[0].qrAssetId = 'private', d => d.profile.intro = 'x'.repeat(2001),
  ]) {
    const copy = structuredClone(original); change(copy); assert.throws(() => m.parseFlowGalleryDocument(copy));
  }
  for (const href of ['javascript:alert(1)', 'data:text/html,hi', '//example.com', '/relative', ['file:', '', '', 'C:', 'private'].join('/'), ' https://example.com', 'https://user:secret@example.invalid', 'mailto:']) {
    const copy = structuredClone(original); copy.contact.items[0].href = href;
    assert.throws(() => m.parseFlowGalleryDocument(copy), href);
  }
  for (const href of ['', 'https://example.com/path?q=1', 'http://example.com', 'mailto:example@example.invalid']) {
    const copy = structuredClone(original); copy.contact.items[0].href = href;
    assert.equal(m.parseFlowGalleryDocument(copy).contact.items[0].href, href);
  }
});

test('flow rail width accepts bounded integer proportions without rewriting legacy documents or other spaces', async t => {
  const m = await schema(t), legacy = filledFlow(m), before = structuredClone(legacy);
  assert.equal(Object.hasOwn(legacy.rails, 'leftWidthPercent'), false);
  assert.deepEqual(m.parseFlowGalleryDocument(legacy), before, 'Legacy stored content remains byte-shape compatible');
  assert.deepEqual(legacy, before);
  assert.equal(Object.hasOwn(m.createEmptyFlowGalleryDocument().rails, 'leftWidthPercent'), false, 'New defaults retain the original 2:1 layout');

  const basic = m.createEmptyBasicContent(), polaroid = m.createEmptyPreviewDocument();
  const otherBefore = structuredClone({ basic, polaroid });
  for (const percentage of [30, 50, 65, 70]) {
    const d = structuredClone(legacy); d.rails.leftWidthPercent = percentage;
    const parsed = m.parseSpaceContent('premium-flow-gallery', d);
    assert.equal(parsed.rails.leftWidthPercent, percentage);
    assert.deepEqual(parsed, d);
    assert.deepEqual(m.contentAssetIds('premium-flow-gallery', parsed), m.contentAssetIds('premium-flow-gallery', legacy), 'Width is not an asset reference');
  }
  for (const percentage of [29, 71, 0, 100, 50.5, NaN, Infinity, -Infinity, '50', null, undefined, true]) {
    const d = structuredClone(legacy); d.rails.leftWidthPercent = percentage;
    assert.throws(() => m.parseFlowGalleryDocument(d), /rails\.leftWidthPercent/, String(percentage));
  }
  assert.throws(() => m.parseSpaceContent('basic', { ...basic, rails: { leftWidthPercent: 50 } }));
  assert.throws(() => m.parseSpaceContent('premium-polaroid', { ...polaroid, rails: { leftWidthPercent: 50 } }));
  assert.deepEqual({ basic, polaroid }, otherBefore);
});

test('flow bounds reject over-limit arrays and UTF-8 document bodies', async t => {
  const m = await schema(t), original = filledFlow(m);
  for (const change of [
    d => d.groups = Array.from({ length: 31 }, (_, i) => ({ ...d.groups[0], id: flowId(100 + i) })),
    d => d.groups[0].assetIds = Array.from({ length: 501 }, (_, i) => flowId(100 + i)),
    d => d.pricing.packages[0].details = Array(31).fill('Detail'),
    d => d.contact.items = Array.from({ length: 21 }, (_, i) => ({ ...d.contact.items[0], id: flowId(200 + i) })),
  ]) { const copy = structuredClone(original); change(copy); assert.throws(() => m.parseFlowGalleryDocument(copy)); }
  const oversized = m.createEmptyFlowGalleryDocument();
  oversized.pricing.packages = Array.from({ length: 30 }, (_, i) => ({ id: flowId(500 + i), name: '', price: '', description: '', enabled: false, details: Array(30).fill('字'.repeat(2000)) }));
  assert.throws(() => m.parseFlowGalleryDocument(oversized), /512 KB/);
});

test('Site schemas reject unknown fields, malformed fields and unsupported template identifiers', async t => {
  const m = await schema(t);
  for (const space of ['basic', 'premium-polaroid']) {
    const original = space === 'basic' ? m.createEmptyBasicContent() : m.createEmptyPreviewDocument();
    for (const change of [
      d => d.siteId = 'forged', d => d.profile.owner = 'forged', d => delete d.contact.email,
      d => d.packages = [{ name: 'incomplete' }], d => d.hero.title = 'x'.repeat(2001),
      d => d.social = [{ label: 'platform', handle: 'fixture', unknown: true }],
    ]) {
      const copy = structuredClone(original); change(copy);
      assert.throws(() => m.parseSpaceContent(space, copy));
    }
  }
  for (const change of [d => d.activeTemplate = 'premium-polaroid', d => d.templateWorks = { unknown: [] }, d => d.templateWorks = [], d => d.works = {}, d => d.collections = []]) {
    const copy = m.createEmptyBasicContent(); change(copy);
    assert.throws(() => m.parseSpaceContent('basic', copy));
  }
});

test('Site asset structure is strict and every reference channel is collected for ownership validation', async t => {
  const m = await schema(t);
  for (const change of [d => d.works.push({ assetId: 'global-photo' }), d => d.templateWorks['cinematic-light'].push({ image: '/photos/global.webp' }), d => d.social.push({ label: 'card', handle: '', qrAssetId: 'a'.repeat(64) })]) {
    const copy = m.createEmptyBasicContent(); change(copy);
    assert.throws(() => m.parseSpaceContent('basic', copy));
  }
  const emptyCollection = { id: '11111111-1111-4111-8111-111111111111', name: 'Empty own collection', description: '', visible: true, coverAssetId: null, coverFit: 'natural', coverFocusX: 50, coverFocusY: 50, assetIds: [], focusAssetId: null };
  const premium = m.createEmptyPreviewDocument(); premium.collections = [emptyCollection];
  assert.deepEqual(m.parseSpaceContent('premium-polaroid', premium), premium);
  for (const change of [d => d.collections[0].assetIds.push('global-photo'), d => d.collections[0].coverAssetId = 'global-photo', d => { d.collections[0].assetIds = ['global-photo']; d.collections[0].focusAssetId = 'global-photo'; }, d => d.social.push({ label: 'card', handle: '', qrAssetId: 'b'.repeat(64) })]) {
    const copy = structuredClone(premium); change(copy);
    assert.throws(() => m.parseSpaceContent('premium-polaroid', copy));
  }
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
  premium.collections[0] = { ...emptyCollection, assetIds: [ids[0], ids[1]], coverAssetId: ids[0], focusAssetId: ids[1] };
  premium.social = [{ label: 'Card', handle: '', qrAssetId: ids[2] }];
  assert.deepEqual(m.parseSpaceContent('premium-polaroid', premium), premium);
  assert.deepEqual(m.contentAssetIds('premium-polaroid', premium).sort(), ids);
  const basic = m.createEmptyBasicContent();
  const work = { assetId: ids[0], code: '', title: '', subtitle: '', image: `/api/sites/fixture/assets/${ids[0]}/full`, preview: '', position: '50% 50%', previewWidth: 100, previewHeight: 100, fullWidth: 100, enabled: true };
  basic.works = [work]; basic.templateWorks['cinematic-light'] = [{ ...work, assetId: ids[1], image: '' }]; basic.social = [{ label: 'Card', handle: '', qrAssetId: ids[2] }];
  const parsed = m.parseSpaceContent('basic', basic);
  assert.equal(parsed.works[0].image, '', 'Only stable identity, not resolved URL, persists');
  assert.deepEqual(m.contentAssetIds('basic', parsed).sort(), ids);
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function load(file, dependencies = {}) {
  const source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URL, TextEncoder, require(id) { if (Object.hasOwn(dependencies, id)) return dependencies[id]; throw Error(`Unexpected dependency ${id}`); } });
  return exports;
}
const copy = value => JSON.parse(JSON.stringify(value));
const ASSET = '11111111-1111-4111-8111-111111111111', MISSING = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333', HIDDEN = '44444444-4444-4444-8444-444444444444';
const schema = await load('app/site-editor/flow-gallery-document.ts');
const view = await load('app/site-editor/flow-gallery-view.tsx', { '../premium-gallery-proof/gallery': { default: 'Gallery' }, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) } });
const state = await load('app/site-editor/flow-gallery-state.ts');
const scrolling = await load('app/premium-gallery-proof/scrollport.ts');
const bodyLocks = await load('app/premium-gallery-proof/body-scroll-lock.ts');
test('preview and nested lightbox retain body lock regardless of unmount order and restore prior overflow once', () => {
  for (const closeParentFirst of [true, false]) {
    const body = { style: { overflow: 'auto' } };
    const releasePreview = bodyLocks.lockGalleryBodyScroll(body);
    const releaseLightbox = bodyLocks.lockGalleryBodyScroll(body);
    (closeParentFirst ? releasePreview : releaseLightbox)();
    assert.equal(body.style.overflow, 'hidden');
    (closeParentFirst ? releaseLightbox : releasePreview)();
    assert.equal(body.style.overflow, 'auto');
    releasePreview(); releaseLightbox();
    assert.equal(body.style.overflow, 'auto');
  }
});
test('body locks retain gallery width for viewport or body scrollbars and restore padding after the final nested release', () => {
  for (const scrollbarOwner of ['viewport', 'body']) {
    for (const closeParentFirst of [true, false]) {
      const body = {
        style: { overflow: '', overflowX: 'hidden', overflowY: 'auto', paddingRight: 'calc(4px + 2px)' },
        scrollTop: 844,
        offsetWidth: scrollbarOwner === 'viewport' ? 1425 : 1440,
        clientWidth: 1421,
        ownerDocument: {
          documentElement: { clientWidth: scrollbarOwner === 'viewport' ? 1425 : 1440, style: { overflow: '', overflowX: 'clip', overflowY: 'visible' } },
          defaultView: { innerWidth: 1440, getComputedStyle: () => ({ paddingRight: '6px', borderLeftWidth: '2px', borderRightWidth: '2px' }) },
        },
      };
      const original = { ...body.style };
      const originalRoot = { ...body.ownerDocument.documentElement.style };
      const releasePreview = bodyLocks.lockGalleryBodyScroll(body);
      assert.equal(body.ownerDocument.documentElement.style.overflow, 'hidden');
      assert.equal(body.style.paddingRight, '21px');
      const releaseLightbox = bodyLocks.lockGalleryBodyScroll(body);
      assert.equal(body.style.paddingRight, '21px', 'Nested locks must not compensate twice');
      (closeParentFirst ? releasePreview : releaseLightbox)();
      assert.equal(body.style.overflow, 'hidden');
      assert.equal(body.ownerDocument.documentElement.style.overflow, 'hidden');
      assert.equal(body.style.paddingRight, '21px');
      (closeParentFirst ? releaseLightbox : releasePreview)();
      assert.deepEqual(body.style, original);
      assert.deepEqual(body.ownerDocument.documentElement.style, originalRoot);
      assert.equal(body.scrollTop, 844);
      releasePreview(); releaseLightbox();
      assert.deepEqual(body.style, original);
    }
  }
});
test('body locking adds no spacing when only borders or overlay scrollbars occupy the body edge', () => {
  const body = {
    style: { overflow: 'auto', overflowX: '', overflowY: '', paddingRight: '8px' },
    offsetWidth: 1440,
    clientWidth: 1436,
    ownerDocument: {
      documentElement: { clientWidth: 1440 },
      defaultView: { innerWidth: 1440, getComputedStyle: () => ({ paddingRight: '8px', borderLeftWidth: '2px', borderRightWidth: '2px' }) },
    },
  };
  const release = bodyLocks.lockGalleryBodyScroll(body);
  assert.equal(body.style.paddingRight, '8px');
  release();
  assert.equal(body.style.paddingRight, '8px');
  assert.equal(body.style.overflow, 'auto');
});
test('saved receipt object key order does not create dirty state; array order remains an edit', () => {
  const edited = { groups: [{ id: GROUP, name: '新建分类', visible: true, assetIds: [ASSET, MISSING], captions: { [ASSET]: 'A', [MISSING]: 'B' } }], profile: { title: '', brand: '', intro: '' } };
  const receipt = { profile: { brand: '', title: '', intro: '' }, groups: [{ id: GROUP, name: '新建分类', assetIds: [ASSET, MISSING], captions: { [MISSING]: 'B', [ASSET]: 'A' }, visible: true }] };
  assert.equal(state.flowGalleryFingerprint(edited), state.flowGalleryFingerprint(receipt));
  const changed = copy(edited); changed.groups[0].assetIds.reverse();
  assert.notEqual(state.flowGalleryFingerprint(changed), state.flowGalleryFingerprint(receipt));
  changed.groups[0].name = ''; // Incomplete text remains comparable before validation.
  assert.doesNotThrow(() => state.flowGalleryFingerprint(changed));
  assert.equal(edited.groups[0].assetIds[0], ASSET);
});
function asset(id = ASSET) {
  return { id, aspectRatio: 2 / 3, orientation: 'portrait', variants: Object.fromEntries(['thumbnail', 'card', 'full'].map(kind => [kind, { src: `/api/sites/test/assets/${id}/${kind}`, width: 1000, height: 1500, bytes: 100 }])) };
}
function document() {
  const d = schema.createEmptyFlowGalleryDocument();
  d.background = { assetId: MISSING, focalPoint: { x: 22, y: 77 } };
  d.groups = [{ id: GROUP, name: '独立分类', assetIds: [ASSET, MISSING], captions: { [ASSET]: '这是本分类的说明' }, visible: true }, { id: HIDDEN, name: '隐藏分类', assetIds: [ASSET], captions: {}, visible: false }];
  d.rails = { leftGroupId: null, rightGroupId: GROUP };
  return d;
}
test('Site renderer resolves only supplied assets and never fills missing resources or explicit rails from proof data', () => {
  const resolved = view.resolveFlowGalleryDocument(document(), [asset()]);
  assert.equal(resolved.background, null);
  assert.deepEqual(copy(resolved.backgroundFocus), { x: 22, y: 77 });
  assert.deepEqual(copy(resolved.featuredGroupIds), { left: null, right: GROUP });
  assert.equal(resolved.groups.length, 1);
  assert.equal(resolved.groups[0].photos.length, 1);
  assert.equal(resolved.groups[0].photos[0].alt, '这是本分类的说明');
  assert.equal(resolved.groups[0].photos[0].url, `/api/sites/test/assets/${ASSET}/full`);
  assert.deepEqual(copy(view.resolveFlowGalleryDocument(document(), []).groups[0].photos), []);
  assert.doesNotMatch(JSON.stringify(resolved), /\/photos\/library|\/preview\/flow-gallery|shaomaimai/);
});

test('Site renderer carries the edited rail width and keeps the original width for legacy content', () => {
  const legacy = document(), before = copy(legacy);
  assert.equal(Object.hasOwn(view.resolveFlowGalleryDocument(legacy, [asset()]), 'leftRailWidthPercent'), false, 'Missing width retains the original CSS 2:1 layout');
  for (const percentage of [30, 50, 70]) {
    const edited = { ...legacy, rails: { ...legacy.rails, leftWidthPercent: percentage } };
    const resolved = view.resolveFlowGalleryDocument(edited, [asset()]);
    assert.equal(resolved.leftRailWidthPercent, percentage);
    assert.deepEqual(copy(resolved.featuredGroupIds), { left: null, right: GROUP });
    assert.deepEqual(copy(resolved.groups), copy(view.resolveFlowGalleryDocument(legacy, [asset()]).groups));
  }
  assert.deepEqual(copy(legacy), before);
});
test('disabled price and contact scenes are omitted; optional QR independently resolves through the Site map', () => {
  const d = document();
  assert.equal(view.resolveFlowGalleryDocument(d, [asset()]).contact, undefined);
  assert.equal(view.resolveFlowGalleryDocument(d, [asset()]).pricing, undefined);
  d.contact = { enabled: true, heading: '联系', intro: '', items: [{ id: GROUP, label: '文字联系', value: '账号', href: '' }, { id: HIDDEN, label: '二维码', value: '', href: '', qrAssetId: ASSET }, { id: MISSING, label: '未载入', value: '', href: '', qrAssetId: MISSING }] };
  d.pricing.enabled = true;
  d.pricing.packages = [{ id: GROUP, name: '有效', price: '说明', description: '', details: [], enabled: true }, { id: HIDDEN, name: '隐藏', price: '', description: '', details: [], enabled: false }];
  const resolved = view.resolveFlowGalleryDocument(d, [asset()]);
  assert.equal(resolved.pricing.packages.length, 1);
  assert.equal(resolved.contact.items[0].qrPhoto, undefined);
  assert.equal(resolved.contact.items[1].qrPhoto.url, `/api/sites/test/assets/${ASSET}/full`);
  assert.equal(resolved.contact.items[2].qrPhoto, undefined);
});
test('selection preserves click order, de-duplicates and rejects unknown assets without changing the group', () => {
  const original = document().groups[0];
  const available = new Set([ASSET, MISSING, HIDDEN]);
  const next = state.addFlowMembers(original, [MISSING, HIDDEN, ASSET], available);
  assert.deepEqual(copy(next.assetIds), [ASSET, MISSING, HIDDEN]);
  assert.deepEqual(copy(original.assetIds), [ASSET, MISSING]);
  assert.throws(() => state.addFlowMembers(original, [GROUP], available), /本站素材/);
  const full = { ...original, assetIds: Array.from({ length: 500 }, (_, n) => String(n)) };
  assert.throws(() => state.addFlowMembers(full, [ASSET], new Set([ASSET])), /500/);
});
test('removing a member removes its caption; removing a category clears its featured references and preserves other content', () => {
  const d = document();
  const removed = state.removeFlowMember(d.groups[0], ASSET);
  assert.deepEqual(copy(removed.assetIds), [MISSING]);
  assert.deepEqual(copy(removed.captions), {});
  const next = state.removeFlowGroup(d, GROUP);
  assert.deepEqual(copy(next.rails), { leftGroupId: null, rightGroupId: null });
  assert.deepEqual(copy(next.groups.map(group => group.id)), [HIDDEN]);
  assert.equal(next.background, d.background);
  assert.equal(next.contact, d.contact);
  schema.parseFlowGalleryDocument(next);
});

test('removing a featured category keeps the independently chosen rail width and untouched group ordering', () => {
  const d = document(); d.rails.leftWidthPercent = 50;
  const before = copy(d), next = state.removeFlowGroup(d, GROUP);
  assert.deepEqual(copy(next.rails), { leftGroupId: null, rightGroupId: null, leftWidthPercent: 50 });
  assert.deepEqual(copy(next.groups.map(group => group.id)), [HIDDEN]);
  assert.deepEqual(copy(d), before);
  schema.parseFlowGalleryDocument(next);
});
test('private preview gallery bookmarks and restores its scrollport without moving the admin or notice; public pages retain window scrolling', () => {
  const calls = [];
  const viewport = { scrollY: 120, scrollTo: options => calls.push(['window', copy(options)]) };
  const port = { scrollTop: 844, scrollTo(options) { this.scrollTop = options.top; calls.push(['artwork', copy(options)]); } };
  const root = { closest(selector) { assert.match(selector, /data-preview-scrollport/); assert.match(selector, /data-flow-scrollport/); return port; } };
  const selected = scrolling.galleryScrollport(root);
  const bookmark = scrolling.galleryScrollTop(selected, viewport);
  scrolling.restoreGalleryScroll(selected, viewport, 0);
  scrolling.restoreGalleryScroll(selected, viewport, bookmark);
  assert.equal(port.scrollTop, 844);
  assert.equal(viewport.scrollY, 120);
  assert.deepEqual(calls.map(call => call[0]), ['artwork', 'artwork']);
  assert.equal(calls[1][1].behavior, 'instant');
  const publicPort = scrolling.galleryScrollport({ closest: () => null });
  assert.equal(scrolling.galleryScrollTop(publicPort, viewport), 120);
  scrolling.restoreGalleryScroll(publicPort, viewport, 120);
  assert.equal(calls[2][0], 'window');
});

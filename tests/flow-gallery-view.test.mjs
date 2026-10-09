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
const photoNames = await load('app/site-editor/flow-gallery-photo-names.ts');
const view = await load('app/site-editor/flow-gallery-view.tsx', { './flow-gallery-photo-names': photoNames, '../premium-gallery-proof/gallery': { default: 'Gallery' }, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) } });
const state = await load('app/site-editor/flow-gallery-state.ts');
const scrolling = await load('app/premium-gallery-proof/scrollport.ts');
const bodyLocks = await load('app/premium-gallery-proof/body-scroll-lock.ts');
const motion = await load('app/premium-gallery-proof/rail-motion.ts');
const sources = await load('app/premium-gallery-proof/photo-source.ts');
const rails = await load('app/premium-gallery-proof/rail-layout.ts');
const gestures = await load('app/premium-gallery-proof/gallery-interaction.ts');
const previewTargets = await load('app/site-editor/flow-gallery-preview.ts');
const groupScrolling = await load('app/premium-gallery-proof/group-preview.ts', { './scrollport': scrolling });

test('valid rail projection preserves selected side, photo scope and saved configuration', () => {
  const first = { id: 'first', name: 'First', photos: [{ id: 'a' }, { id: 'b' }] };
  const second = { id: 'second', name: 'Second', photos: [{ id: 'c' }] };
  const content = { groups: [first, { id: 'empty', photos: [] }, second], leftRailWidthPercent: 70 };
  for (const [left, right, mode, sides] of [
    ['first', null, 'single', [0]], [null, 'second', 'single', [1]],
    ['first', 'second', 'dual', [0, 1]], ['first', 'first', 'dual', [0, 1]],
    [null, null, 'empty', []], ['missing', 'empty', 'empty', []],
    ['first', 'missing', 'single', [0]], ['empty', 'second', 'single', [1]],
  ]) {
    const document = { ...content, featuredGroupIds: { left, right } }, before = JSON.stringify(document);
    const result = rails.galleryRailLayout(document);
    assert.equal(result.mode, mode);
    assert.deepEqual(copy(result.columns.map(column => column.side)), sides);
    assert.deepEqual(copy(result.columns.map(column => column.widthPercent)), mode === 'single' ? [100] : mode === 'dual' ? [70, 30] : []);
    for (const column of result.columns) assert.strictEqual(column.group, column.group.id === 'first' ? first : second, 'Lightbox scope retains the exact selected group and member order');
    assert.equal(JSON.stringify(document), before, 'Rendering never fills an unassigned side or overwrites the saved proportion');
  }
  assert.deepEqual(copy(rails.galleryRailLayout(content).columns.map(column => column.group.id)), ['first', 'second'], 'Only the anonymous proof falls back to the first two nonempty groups');
  assert.equal(rails.galleryRailLayout({ groups: [] }).mode, 'empty');
  assert.equal(rails.galleryRailLayout({ groups: [first] }).mode, 'single');
  assert.equal(rails.galleryRailLayout({ groups: [first, second] }).columns[0].widthPercent, 200 / 3);
});

test('single rail responsive source hints use bounded width until actual image measurement', () => {
  assert.equal(rails.galleryRailSizes(100, true, null), '(max-width: 700px) min(300px, calc(100vw - 40px)), min(500px, 55vw)');
  assert.equal(rails.galleryRailSizes(70, false, null), '(max-width: 700px) calc((100vw - 52px) * 0.7), calc((55vw - 17px) * 0.7)');
  assert.equal(rails.galleryRailSizes(100, true, 278), '278px');
  assert.equal(rails.galleryRailSizes(70, false, 496), '496px');
});

test('scene swipe requires one tracked finger and ignores controls, pinch endings and vertical reading', () => {
  const touch = (identifier, clientX, clientY = 100) => ({ identifier, clientX, clientY });
  const start = gestures.beginGallerySwipe([touch(4, 200)], false);
  assert.equal(gestures.completeGallerySwipe(start, [touch(4, 120)], 0), 1);
  assert.equal(gestures.completeGallerySwipe(start, [touch(4, 280)], 0), -1);
  assert.equal(gestures.completeGallerySwipe(start, [touch(4, 150)], 0), null);
  assert.equal(gestures.completeGallerySwipe(start, [touch(4, 120, 250)], 0), null);
  assert.equal(gestures.beginGallerySwipe([touch(4, 200)], true), null);
  assert.equal(gestures.beginGallerySwipe([touch(4, 200), touch(5, 250)], false), null);
  assert.equal(gestures.completeGallerySwipe(start, [touch(4, 120)], 1), null);
  assert.equal(gestures.completeGallerySwipe(start, [touch(5, 120)], 0), null);
  assert.equal(gestures.completeGallerySwipe(null, [touch(4, 120)], 0), null);
});

test('classification lightbox order wraps without changing the photo scope; single QR remains single', () => {
  const scope = ['portrait', 'landscape', 'square'];
  assert.equal(scope[gestures.nextGalleryPhotoIndex(0, scope.length, -1)], 'square');
  assert.equal(scope[gestures.nextGalleryPhotoIndex(2, scope.length, 1)], 'portrait');
  let index = 0;
  for (let i = 0; i < 6; i++) index = gestures.nextGalleryPhotoIndex(index, scope.length, 1);
  assert.equal(index, 0); assert.deepEqual(scope, ['portrait', 'landscape', 'square']);
  assert.equal(gestures.nextGalleryPhotoIndex(0, 1, -1), 0);
  assert.equal(gestures.nextGalleryPhotoIndex(0, 0, 1), 0);
});

test('wheel moves forward and reverse loops in the same visual direction, reversibly across either loop boundary', () => {
  const height = 1250, duration = 50000;
  for (const reverse of [false, true]) {
    for (const start of [0, 100, 25000, 49900]) {
      for (const delta of [-4000, -360, 360, 4000]) {
        const next = motion.railTimeAfterWheel(start, duration, height, delta, reverse);
        assert.ok(next >= 0 && next < duration);
        const restored = motion.railTimeAfterWheel(next, duration, height, -delta, reverse);
        assert.ok(Math.abs(restored - start) < 0.001);
        const visualDelta = (next - start) / duration * height * (reverse ? 1 : -1);
        const turns = (visualDelta + delta) / height;
        assert.ok(Math.abs(turns - Math.round(turns)) < 0.001, 'Wheel displacement is exact modulo identical photo copies');
      }
    }
  }
});
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
  return { id, aspectRatio: 2 / 3, orientation: 'portrait', variants: Object.fromEntries([['thumbnail', 267, 400], ['card', 734, 1100], ['full', 1467, 2200]].map(([kind, width, height]) => [kind, { src: `/api/sites/test/assets/${id}/${kind}`, width, height, bytes: 100 }])) };
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
  assert.equal(resolved.groups[0].photos[0].url, `/api/sites/test/assets/${ASSET}/card`);
  assert.equal(resolved.groups[0].photos[0].fullUrl, `/api/sites/test/assets/${ASSET}/full`);
  assert.equal(resolved.groups[0].photos[0].width, 1467);
  assert.equal(resolved.groups[0].photos[0].height, 2200);
  assert.deepEqual(copy(view.resolveFlowGalleryDocument(document(), []).groups[0].photos), []);
  assert.doesNotMatch(JSON.stringify(resolved), /\/photos\/library|\/preview\/flow-gallery|shaomaimai/);
});


test('Flow photo names preserve captions and identify the category and displayed order after missing assets are removed', () => {
  const d = document();
  d.groups[0].assetIds = [HIDDEN, ASSET, MISSING];
  d.groups[0].captions = { [ASSET]: '  已填写的说明  ', [MISSING]: '   ' };
  d.groups.push({ id: MISSING, name: '另一分类', assetIds: [MISSING, ASSET], captions: {}, visible: true });
  const before = JSON.stringify(d);
  const resolved = view.resolveFlowGalleryDocument(d, [asset(), asset(MISSING)]);
  assert.deepEqual(copy(resolved.groups.map(group => group.photos.map(photo => [photo.id, photo.alt]))), [
    [[ASSET, '  已填写的说明  '], [MISSING, '独立分类 · 第 2 张照片']],
    [[MISSING, '另一分类 · 第 1 张照片'], [ASSET, '另一分类 · 第 2 张照片']],
  ]);
  assert.equal(JSON.stringify(d), before, 'Accessible fallbacks do not write captions or alter member order');
  for (const [orientation, name] of [['landscape', '横幅'], ['portrait', '竖幅'], ['square', '方幅']]) {
    assert.equal(photoNames.flowAssetName({ orientation }, 0), `第 1 张照片，${name}`);
    assert.equal(photoNames.flowAssetName({ orientation }, 48), `第 49 张照片，${name}`, 'Later pages continue the filtered result numbering');
  }
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

test('current-group preview uses stable identity after reorder and rejects hidden, empty or removed targets without changing content', () => {
  const d = document();
  const second = { id: MISSING, name: '第二分类', assetIds: [ASSET], captions: {}, visible: true };
  d.groups.push(second);
  for (const groups of [d.groups, [...d.groups].reverse()]) {
    const edited = { ...d, groups };
    const before = state.flowGalleryFingerprint(edited);
    assert.deepEqual(copy(previewTargets.resolveFlowGroupPreview(edited, [asset()], MISSING)), { status: 'ready', groupId: MISSING, name: '第二分类' });
    assert.equal(state.flowGalleryFingerprint(edited), before);
  }
  const before = copy(d);
  for (const id of [null, 'removed-id']) {
    const result = previewTargets.resolveFlowGroupPreview(d, [asset()], id);
    assert.equal(result.status, 'missing'); assert.match(result.message, /已不存在/);
  }
  const hidden = previewTargets.resolveFlowGroupPreview(d, [asset()], HIDDEN);
  assert.equal(hidden.status, 'hidden'); assert.match(hidden.message, /已隐藏/);
  const unavailable = previewTargets.resolveFlowGroupPreview(d, [], GROUP);
  assert.equal(unavailable.status, 'empty'); assert.match(unavailable.message, /没有可展示的照片/);
  const emptyDocument = { ...d, groups: [{ ...second, assetIds: [] }] };
  assert.equal(previewTargets.resolveFlowGroupPreview(emptyDocument, [asset()], MISSING).status, 'empty');
  assert.deepEqual(copy(d), before);
});

test('targeted preview forwards its opening identity while retaining all visible groups, original order and rail configuration', () => {
  const d = document();
  d.groups.push({ id: MISSING, name: '第二分类', assetIds: [ASSET], captions: {}, visible: true });
  const before = copy(d);
  const targeted = view.SiteFlowGalleryView({ document: d, assets: [asset()], previewGroupId: MISSING });
  assert.equal(targeted.props.previewGroupId, MISSING);
  assert.deepEqual(copy(targeted.props.document.groups.map(group => group.id)), [GROUP, MISSING]);
  assert.deepEqual(copy(targeted.props.document.featuredGroupIds), { left: before.rails.leftGroupId, right: before.rails.rightGroupId });
  const fromTop = view.SiteFlowGalleryView({ document: d, assets: [asset()] });
  assert.equal(fromTop.props.previewGroupId, undefined);
  assert.deepEqual(copy(fromTop.props.document), copy(targeted.props.document));
  assert.deepEqual(copy(d), before);
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
  assert.equal(resolved.contact.items[1].qrPhoto.url, `/api/sites/test/assets/${ASSET}/card`);
  assert.equal(resolved.contact.items[2].qrPhoto, undefined);
});

test('responsive sources use actual portrait widths, retain DPR choices and request full only for the viewer', () => {
  const photo = view.resolveFlowGalleryDocument(document(), [asset()]).groups[0].photos[0];
  const props = sources.galleryPhotoSource(photo, '386px');
  assert.equal(props.src, `/api/sites/test/assets/${ASSET}/card`);
  assert.equal(props.sizes, '386px');
  assert.equal(props.srcSet, `\/api/sites/test/assets/${ASSET}/thumbnail 267w, /api/sites/test/assets/${ASSET}/card 734w, /api/sites/test/assets/${ASSET}/full 1467w`);
  assert.deepEqual(copy(sources.galleryPhotoSource(photo, '386px', true)), { src: photo.fullUrl });
  const duplicate = { ...photo, variants: [{ url: 'thumb', width: 200 }, { url: 'card', width: 200 }, { url: 'full', width: 400 }, { url: 'invalid', width: 0 }] };
  assert.equal(sources.galleryPhotoSource(duplicate, '150px').srcSet, 'thumb 200w, full 400w');
  const proof = { id: 'proof', url: '/local-anonymous.svg', width: 600, height: 900, alt: 'Anonymous' };
  assert.deepEqual(copy(sources.galleryPhotoSource(proof, '386px')), { src: proof.url });
  assert.deepEqual(copy(sources.galleryPhotoSource(proof, '386px', true)), { src: proof.url });
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

test('current-group positioning accounts for the preview viewport origin and navigation height without scrolling the editor', () => {
  const calls = [];
  const viewport = { scrollY: 588, scrollTo: options => calls.push(['editor', copy(options)]) };
  const port = { scrollTop: 250, getBoundingClientRect: () => ({ top: 64 }), scrollTo(options) { this.scrollTop = Math.min(options.top, 1800); calls.push(['preview', copy(options)]); } };
  const root = { closest: () => port, querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 142 }) }) };
  const heading = { getBoundingClientRect: () => ({ top: 1190 }) };
  const bookmark = groupScrolling.scrollToGalleryGroup(root, heading, viewport);
  assert.equal(bookmark, 1282);
  assert.equal(viewport.scrollY, 588);
  assert.deepEqual(calls, [['preview', { top: 1282, left: 0, behavior: 'instant' }]]);
  // A short final group may clamp to the end; remember the achieved position.
  port.scrollTop = 0;
  assert.equal(groupScrolling.scrollToGalleryGroup(root, { getBoundingClientRect: () => ({ top: 2500 }) }, viewport), 1800);
  port.scrollTop = 0;
  assert.equal(groupScrolling.scrollToGalleryGroup(root, { getBoundingClientRect: () => ({ top: 50 }) }, viewport), 0);
});

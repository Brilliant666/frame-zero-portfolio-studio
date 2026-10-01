import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function load(file) {
  const source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URL, TextEncoder, require(id) { throw Error(`Unexpected dependency ${id}`); } });
  return exports;
}
const schema = await load('app/site-editor/flow-gallery-document.ts');
const ui = await load('app/site-editor/flow-gallery-admin-ui.ts');
const state = await load('app/site-editor/flow-gallery-state.ts');
const ASSET = '11111111-1111-4111-8111-111111111111', SECOND = '22222222-2222-4222-8222-222222222222';
function draft() {
  const d = schema.createEmptyFlowGalleryDocument();
  d.profile.title = '正在编辑的作品';
  d.groups = [{ id: SECOND, name: '本站独立分类', assetIds: [ASSET, SECOND], captions: { [ASSET]: '原说明' }, visible: true }];
  d.pricing.heading = '独立价格'; d.contact.heading = '独立联系';
  return d;
}
test('disabled module preview enables only the requested scene in a deep copy without changing dirty content, member order or stored flags', () => {
  for (const section of ['pricing', 'contact']) {
    const d = draft(); d.rails.leftWidthPercent = 50;
    const before = state.flowGalleryFingerprint(d);
    const preview = ui.flowModulePreview(d, section);
    assert.notEqual(preview, d);
    assert.notEqual(preview.groups, d.groups);
    assert.equal(preview[section].enabled, true);
    assert.equal(preview[section === 'pricing' ? 'contact' : 'pricing'].enabled, false);
    assert.equal(preview[section].heading, d[section].heading);
    assert.equal(preview.rails.leftWidthPercent, 50, 'Module previews retain the edited home proportions');
    preview.groups[0].assetIds.reverse(); preview.groups[0].captions[ASSET] = '临时预览说明';
    assert.equal(state.flowGalleryFingerprint(d), before);
    assert.equal(d.pricing.enabled, false); assert.equal(d.contact.enabled, false);
    assert.equal(d.groups[0].assetIds[0], ASSET);
    schema.parseFlowGalleryDocument(d);
  }
});
test('home, complete works and enabled optional module previews retain the exact current content', () => {
  const d = draft(); d.pricing.enabled = true; d.contact.enabled = true;
  for (const section of ['library', 'home', 'groups', 'pricing', 'contact']) assert.equal(ui.flowModulePreview(d, section), d);
});

test('changing rail width marks an edit and selecting the original ratio returns to the saved legacy state', () => {
  const d = draft(), saved = state.flowGalleryFingerprint(d);
  d.rails.leftWidthPercent = 70;
  const sevenThree = state.flowGalleryFingerprint(d);
  assert.notEqual(sevenThree, saved);
  d.rails.leftWidthPercent = 50;
  assert.notEqual(state.flowGalleryFingerprint(d), sevenThree);
  assert.equal(ui.flowModulePreview(d, 'home').rails.leftWidthPercent, 50);
  delete d.rails.leftWidthPercent;
  assert.equal(state.flowGalleryFingerprint(d), saved);
});

test('editor module hashes restore only valid modules and never interpret public preview scenes', () => {
  for (const section of ['library', 'home', 'groups', 'pricing', 'contact']) assert.equal(ui.flowSectionFromHash(`#edit-${section}`), section);
  for (const hash of ['', '#works', '#gallery', '#pricing', '#contact', '#edit-unknown', '#edit-home/other']) assert.equal(ui.flowSectionFromHash(hash), null);
});
test('undo photo removal restores position and caption without reverting later group edits or rails', () => {
  const d = draft(), removal = { kind: 'photo', groupId: SECOND, id: ASSET, caption: d.groups[0].captions[ASSET], index: 0 };
  d.groups[0] = state.removeFlowMember(d.groups[0], ASSET);
  d.groups[0].name = 'Later name'; d.groups[0].captions[SECOND] = 'Later caption'; d.rails.leftWidthPercent = 70;
  const restored = state.restoreFlowRemoval(d, removal);
  assert.equal(restored.groups[0].assetIds.join(','), [ASSET, SECOND].join(','));
  assert.equal(restored.groups[0].captions[ASSET], '原说明'); assert.equal(restored.groups[0].captions[SECOND], 'Later caption');
  assert.equal(restored.groups[0].name, 'Later name'); assert.equal(restored.rails.leftWidthPercent, 70);
  assert.equal(d.groups[0].assetIds.length, 1, 'No mutation of the input');
  assert.equal(state.restoreFlowRemoval(restored, removal), restored, 'Undo cannot insert a duplicate');
  assert.throws(() => state.restoreFlowRemoval({ ...d, groups: [] }, removal), /分类已移除/);
  const full = { ...d, groups: [{ ...d.groups[0], assetIds: Array.from({length: 500}, (_, i) => `photo-${i}`) }] };
  assert.throws(() => state.restoreFlowRemoval(full, removal), /500/);
});
test('undo price and contact removal restores only the deleted entry and respects capacity', () => {
  for (const kind of ['price', 'contact']) {
    const d = draft(), key = kind === 'price' ? 'pricing' : 'contact', list = kind === 'price' ? 'packages' : 'items';
    const item = kind === 'price' ? { id: ASSET, name: 'Original', price: '100', description: '', details: [], enabled: true } : { id: ASSET, label: 'Original', value: 'Email', href: 'mailto:a@example.invalid' };
    const other = { ...item, id: SECOND };
    d[key][list] = [other]; d[key].heading = 'Changed heading';
    const restored = state.restoreFlowRemoval(d, { kind, item, index: 0 });
    assert.equal(restored[key].heading, 'Changed heading'); assert.equal(restored[key][list][0].id, ASSET); assert.equal(restored[key][list][1].id, SECOND);
    assert.equal(state.restoreFlowRemoval(restored, { kind, item, index: 0 }), restored);
    d[key][list] = Array.from({ length: kind === 'price' ? 30 : 20 }, (_, i) => ({...other, id: `item-${i}`}));
    assert.throws(() => state.restoreFlowRemoval(d, { kind, item, index: 0 }), /上限/);
  }
});

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

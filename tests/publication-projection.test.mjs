import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function projection(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-projection-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const modules = {
    catalog: 'templates/catalog.ts', policy: 'photo-ratio-policy.ts', orientation: 'templates/shared/source-orientation-layout.ts',
    slots: 'templates/shared/photo-slots.tsx', fallback: 'templates/shared/template-work-fallback.ts',
    document: 'preview-workspace/document.ts', schema: 'site-editor/content-schema.ts', projection: 'site-editor/publication-projection.ts',
  };
  const imports = { '../catalog': 'catalog', '../templates/catalog': 'catalog', '../site-config': 'catalog', '../../photo-ratio-policy': 'policy', './source-orientation-layout': 'orientation', './photo-slots': 'slots', './photo-slots.module.css': 'styles', '../templates/shared/photo-slots': 'slots', '../templates/shared/template-work-fallback': 'fallback', '../preview-workspace/document': 'document', './content-schema': 'schema', 'react/jsx-runtime': 'jsx' };
  await fs.writeFile(path.join(directory, 'styles.mjs'), 'export default {};');
  await fs.writeFile(path.join(directory, 'jsx.mjs'), 'export const jsx=()=>null;export const jsxs=jsx;export const Fragment=Symbol();');
  for (const [name, source] of Object.entries(modules)) {
    let code = ts.transpileModule(await fs.readFile(new URL(`../app/${source}`, import.meta.url), 'utf8'), { fileName: source, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    for (const [from, to] of Object.entries(imports)) code = code.replaceAll(`from "${from}"`, `from "./${to}.mjs"`);
    await fs.writeFile(path.join(directory, `${name}.mjs`), code);
  }
  const load = name => import(pathToFileURL(path.join(directory, `${name}.mjs`)).href);
  return { ...await load('projection'), ...await load('schema'), ...await load('document'), ...await load('catalog') };
}
const id = n => `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const work = (n, slotIndex = 0, enabled = true) => ({ assetId: id(n), slotIndex, enabled, code: '', title: `Photo ${n}`, subtitle: '', image: '', preview: '', position: '50% 50%', previewWidth: 900, previewHeight: 600, fullWidth: 900, locked: false });

test('all eleven basic snapshots keep only enabled active-template slots and leave drafts untouched', async t => {
  const m = await projection(t);
  assert.equal(m.templateCatalog.length, 11);
  for (const template of m.templateCatalog) {
    const content = m.createEmptyBasicContent(); content.activeTemplate = template.id;
    content.works = [work(9)];
    content.templateWorks = { [template.id]: [...Array.from({ length: template.photoSlots }, (_, slot) => work(1, slot)), work(2, 1, false), work(3, template.photoSlots)], [m.templateCatalog.find(x => x.id !== template.id).id]: [work(4)] };
    content.packages = [{ number: '', english: '', name: 'Private disabled package', description: '', price: '', duration: '', deliverables: [], enabled: false }];
    content.social = [{ label: 'Blank', handle: '' }, { label: 'Public link', handle: 'account' }];
    const before = structuredClone(content);
    const prepared = m.preparePublication(content, 'basic');
    assert.equal(prepared.templateId, template.id); assert.deepEqual(prepared.assetIds, [id(1)], template.id);
    assert.deepEqual(Object.keys(prepared.content.templateWorks), [template.id]);
    assert.equal(prepared.content.templateWorks[template.id][0].slotIndex, 0);
    assert.deepEqual(prepared.content.works, []); assert.deepEqual(prepared.content.packages, []);
    assert.deepEqual(prepared.content.social, [{ label: 'Public link', handle: 'account' }]);
    assert.deepEqual(content, before);
  }
});

test('explicit empty basic layout does not fall back, while missing layout freezes legacy assignment', async t => {
  const m = await projection(t), content = m.createEmptyBasicContent(); content.works = [work(1)];
  assert.deepEqual(m.preparePublication(content, 'basic').assetIds, []);
  delete content.templateWorks[content.activeTemplate];
  const prepared = m.preparePublication(content, 'basic');
  assert.deepEqual(prepared.assetIds, [id(1)]);
  assert.equal(prepared.content.templateWorks[content.activeTemplate][0].slotIndex, 0);
});

test('premium projection remains independent and excludes hidden collections and blank social records', async t => {
  const m = await projection(t), content = m.createEmptyPreviewDocument();
  const collection = { id: id(30), name: 'Visible', description: '', visible: true, assetIds: [id(1)], coverAssetId: id(2), focusAssetId: null, coverFit: 'natural', coverFocusX: 50, coverFocusY: 50 };
  content.collections = [collection, { ...collection, id: id(31), visible: false, assetIds: [id(3)], coverAssetId: null }];
  content.social = [{ label: 'Blank', handle: '  ' }, { label: 'Card', handle: '', qrAssetId: id(4) }];
  const before = structuredClone(content), prepared = m.preparePublication(content);
  assert.equal(prepared.templateId, 'premium-polaroid'); assert.deepEqual(new Set(prepared.assetIds), new Set([id(1), id(2), id(4)]));
  assert.equal(prepared.content.collections.length, 1); assert.equal(prepared.content.social.length, 1); assert.deepEqual(content, before);
});

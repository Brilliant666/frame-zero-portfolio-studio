import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const dataModule = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const documentModule = dataModule(transpile(await read('app/site-editor/flow-gallery-document.ts')));
const source = await read('app/admin-design-proof/state.ts');
const js = transpile(source).replace('"../site-editor/flow-gallery-document"', JSON.stringify(documentModule));
const { proofAssets, newProofGroup, proofGroups, proofHome, addProofMembers, removeProofMember, filterProofAssets, proofSnapshot, validateProofUpload } = await import(dataModule(js));

async function load(file, dependencies, env = {}, globals = {}) {
  const code = ts.transpileModule(await read(file), { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env }, Response, Request, URL, Uint8Array, ...globals,
    require(id) { if (Object.hasOwn(dependencies, id)) return dependencies[id]; throw Error(`Unexpected dependency ${id}`); } });
  return exports;
}

test('selection order appends once, preserving existing order and photo captions', () => {
  const assets = proofAssets(6);
  const original = { ...newProofGroup('new', '  午后  '), assetIds: [assets[1].id, assets[0].id], captions: { [assets[0].id]: '窗边' } };
  const next = addProofMembers(original, [assets[4].id, assets[1].id, assets[3].id, assets[4].id], assets);
  assert.deepEqual(next.assetIds, [assets[1].id, assets[0].id, assets[4].id, assets[3].id]);
  assert.deepEqual(next.captions, { [assets[0].id]: '窗边' });
  assert.equal(next.name, '午后');
  assert.deepEqual(original.assetIds, [assets[1].id, assets[0].id]);
});

test('unknown selection IDs never enter collection; existing unavailable references survive', () => {
  const assets = proofAssets(3);
  const original = { ...newProofGroup('retained', '引用恢复'), assetIds: ['previous-unavailable'], captions: { 'previous-unavailable': '待恢复' } };
  const next = addProofMembers(original, ['unknown', '', '__proto__', assets[2].id, 'unknown'], assets);
  assert.deepEqual(next.assetIds, ['previous-unavailable', assets[2].id]);
  assert.equal(next.captions['previous-unavailable'], '待恢复');
  const empty = addProofMembers(newProofGroup('new', '新图集'), ['unknown'], assets);
  assert.deepEqual(empty.assetIds, []);
  const first = addProofMembers(empty, [assets[2].id, assets[0].id], assets);
  assert.deepEqual(first.assetIds, [assets[2].id, assets[0].id]);
});

test('removing member preserves library and clears only its caption', () => {
  const assets = proofAssets(4);
  const beforeLibrary = JSON.stringify(assets);
  const original = { ...newProofGroup('album', '图集'), assetIds: assets.slice(0, 3).map(a => a.id), captions: { [assets[0].id]: '保留说明', [assets[1].id]: '移出说明' } };
  const next = removeProofMember(original, assets[1].id);
  assert.deepEqual(next.assetIds, [assets[0].id, assets[2].id]);
  assert.deepEqual(next.captions, { [assets[0].id]: '保留说明' });
  assert.equal(JSON.stringify(assets), beforeLibrary);
  assert.equal(original.captions[assets[1].id], '移出说明');
  const last = removeProofMember({ ...original, assetIds: [assets[1].id], captions: { [assets[1].id]: '最后一张' } }, assets[1].id);
  assert.deepEqual(last.assetIds, []);
  assert.deepEqual(last.captions, {});
});

test('library filter combines trimmed name and orientation without altering assets', () => {
  const assets = proofAssets(18);
  const before = JSON.stringify(assets);
  assert.equal(filterProofAssets(assets, '', 'all').length, 18);
  assert.equal(filterProofAssets(assets, '  柔光  ', 'portrait').length, 6);
  assert.equal(filterProofAssets(assets, '柔光', 'landscape').length, 0);
  assert.equal(filterProofAssets(assets, '不存在', 'all').length, 0);
  assert.equal(filterProofAssets(assets, '02', 'all')[0].id, assets[1].id);
  const latin = [{ ...assets[0], name: 'Studio Afternoon' }];
  assert.equal(filterProofAssets(latin, ' STUDIO ', 'all').length, 1);
  assert.equal(JSON.stringify(assets), before);
});

test('upload checks accepted image formats and exact 20 MB boundary', () => {
  const maximum = 20 * 1024 * 1024;
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validateProofUpload({ type, size: maximum }), null);
    assert.match(validateProofUpload({ type, size: maximum + 1 }), /20 MB/);
    assert.match(validateProofUpload({ type, size: 0 }), /为空/);
  }
  for (const type of ['', 'image/svg+xml', 'image/gif', 'text/plain']) assert.match(validateProofUpload({ type, size: 100 }), /JPG、PNG 或 WebP/);
});

test('draft snapshots remain immutable and distinct from simulated public snapshot', () => {
  const assets = proofAssets();
  const collections = proofGroups(assets);
  const published = proofSnapshot(collections);
  const editing = collections.map((collection, index) => index === 0 ? addProofMembers(collection, [assets[17].id], assets) : collection);
  const savedDraft = proofSnapshot(editing);
  assert.notEqual(savedDraft, published);
  editing[0] = { ...editing[0], name: '进一步修改', visible: false };
  assert.notEqual(proofSnapshot(editing), savedDraft);
  assert.equal(JSON.parse(savedDraft).groups[0].name, '午后的光');
  assert.equal(JSON.parse(savedDraft).groups[0].assetIds.at(-1), assets[17].id);
  assert.equal(JSON.parse(published).groups[0].assetIds.length, 6);
  assert.equal(proofSnapshot(collections), published);
  const home = proofHome();
  const reassigned = { ...home, rails: { ...home.rails, leftGroupId: collections[1].id, rightGroupId: null, leftWidthPercent: 70 } };
  const changedHome = proofSnapshot(collections, reassigned);
  assert.notEqual(changedHome, published, 'Homepage assignments belong to draft/public snapshot');
  assert.equal(JSON.parse(changedHome).rails.leftGroupId, collections[1].id);
  assert.equal(JSON.parse(changedHome).rails.leftWidthPercent, 70);
  for (const field of ['coverAssetId', 'coverFit', 'description', 'focusAssetId']) assert.equal(Object.hasOwn(JSON.parse(changedHome).groups[0], field), false, 'Flow group must not inherit Polaroid fields');
});

test('candidate page requires flag and parent preview layout requires runner proof', async () => {
  const denied = error => error.status === 404;
  const notFound = () => { throw Object.assign(Error('Not found'), { status: 404 }); };
  const dependencies = { 'next/navigation': { notFound }, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) }, '../../admin-design-proof/workspace': { __esModule: true, default: 'AdminDesignProof' } };
  for (const flag of [undefined, '0', 'true']) {
    const page = await load('app/preview/admin-design/page.tsx', dependencies, { FRAME_ZERO_ADMIN_DESIGN_PROOF: flag });
    assert.throws(() => page.default(), denied);
  }
  const page = await load('app/preview/admin-design/page.tsx', dependencies, { FRAME_ZERO_ADMIN_DESIGN_PROOF: '1' });
  const candidate = page.default();
  assert.equal(candidate.type, 'AdminDesignProof');
  for (const allowed of [false, true]) {
    const layout = await load('app/preview/layout.tsx', { 'next/navigation': { notFound }, '../preview-workspace/server': { requirePreviewWorkspace: async () => allowed } });
    if (allowed) assert.equal(await layout.default({ children: candidate }), candidate);
    else await assert.rejects(layout.default({ children: candidate }), denied);
  }
});

test('candidate image gate denies unsafe keys and sizes before reading disk', async () => {
  let reads = 0;
  const dependencies = allowed => ({ 'node:fs/promises': { readFile: async () => { reads++; throw Error('No files expected'); } }, 'node:path': path,
    sharp: () => { throw Error('No conversion expected'); }, '../../../../preview-workspace/server': { requirePreviewWorkspace: async () => allowed } });
  const request = size => new Request(`http://127.0.0.1/preview/admin-design/asset/background?size=${size}`);
  for (const [flag, allowed] of [[undefined, true], ['0', true], ['1', false]]) {
    const route = await load('app/preview/admin-design/asset/[key]/route.ts', dependencies(allowed), { FRAME_ZERO_ADMIN_DESIGN_PROOF: flag, FRAME_ZERO_ADMIN_DESIGN_ASSET_ROOT: '/fixture' });
    assert.equal((await route.GET(request('card'), { params: Promise.resolve({ key: 'background' }) })).status, 404);
  }
  const route = await load('app/preview/admin-design/asset/[key]/route.ts', dependencies(true), { FRAME_ZERO_ADMIN_DESIGN_PROOF: '1' });
  for (const key of ['../background', '..\\background', '__proto__', 'constructor', 'missing']) assert.equal((await route.GET(request('card'), { params: Promise.resolve({ key }) })).status, 404);
  for (const size of ['original', '__proto__', 'constructor', '9999']) assert.equal((await route.GET(request(size), { params: Promise.resolve({ key: 'background' }) })).status, 404);
  assert.equal(reads, 0);
  const response = await route.GET(request('thumbnail'), { params: Promise.resolve({ key: 'portrait' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await response.text(), /<svg/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function load(file, dependencies = {}, env = {}) {
  const source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env }, Response, Request, Uint8Array,
    require(id) { if (Object.hasOwn(dependencies, id)) return dependencies[id]; throw Error(`Unexpected dependency ${id}`); } });
  return exports;
}
const notFound = () => { throw Object.assign(Error('Not found'), { status: 404 }); };
const denied = error => error.status === 404;
const jsx = { jsx: (type, props) => ({ type, props }) };

test('proof entry requires feature flag and existing preview parent gate', async () => {
  let fixtures = 0;
  const dependencies = { 'next/navigation': { notFound }, 'react/jsx-runtime': jsx,
    '../../premium-gallery-proof/gallery': { default: 'Gallery' },
    '../../premium-gallery-proof/fixture': { galleryFixture: variant => { fixtures++; return { variant }; } } };
  for (const flag of [undefined, '0', 'true']) {
    const page = await load('app/preview/flow-gallery/page.tsx', dependencies, { FRAME_ZERO_FLOW_GALLERY_PROOF: flag });
    await assert.rejects(page.default({ searchParams: Promise.resolve({ fixture: 'long' }) }), denied);
  }
  assert.equal(fixtures, 0);
  const page = await load('app/preview/flow-gallery/page.tsx', dependencies, { FRAME_ZERO_FLOW_GALLERY_PROOF: '1' });
  const child = await page.default({ searchParams: Promise.resolve({ fixture: 'long' }) });
  assert.equal(child.props.document.variant, 'long');
  for (const allowed of [false, true]) {
    const layout = await load('app/preview/layout.tsx', { 'next/navigation': { notFound }, '../preview-workspace/server': { requirePreviewWorkspace: async () => allowed } });
    if (allowed) assert.equal(await layout.default({ children: child }), child);
    else await assert.rejects(layout.default({ children: child }), denied);
  }
});

test('asset endpoint denies disabled proof, missing runner proof and unsafe keys before disk access', async () => {
  let reads = 0;
  const dependencies = allowed => ({ 'node:fs/promises': { readFile: async () => { reads++; return new Uint8Array([1, 2]); } }, 'node:path': path,
    '../../../../preview-workspace/server': { requirePreviewWorkspace: async () => allowed } });
  for (const [flag, allowed] of [[undefined, true], ['0', true], ['1', false]]) {
    const route = await load('app/preview/flow-gallery/asset/[key]/route.ts', dependencies(allowed), { FRAME_ZERO_FLOW_GALLERY_PROOF: flag, FRAME_ZERO_FLOW_GALLERY_ASSET_ROOT: '/fixture' });
    assert.equal((await route.GET(new Request('http://127.0.0.1/preview/flow-gallery/asset/background'), { params: Promise.resolve({ key: 'background' }) })).status, 404);
  }
  const route = await load('app/preview/flow-gallery/asset/[key]/route.ts', dependencies(true), { FRAME_ZERO_FLOW_GALLERY_PROOF: '1', FRAME_ZERO_FLOW_GALLERY_ASSET_ROOT: '/fixture' });
  for (const key of ['../background.png', '..\\background.png', '%2e%2e%2fbackground.png', '/background', 'constructor', '__proto__', 'missing']) {
    assert.equal((await route.GET(new Request('http://127.0.0.1/preview/flow-gallery/asset/key'), { params: Promise.resolve({ key }) })).status, 404, key);
  }
  assert.equal(reads, 0);
  const response = await route.GET(new Request('http://127.0.0.1/preview/flow-gallery/asset/background'), { params: Promise.resolve({ key: 'background' }) });
  assert.equal(response.status, 200); assert.equal(reads, 1);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
});

test('repository fixture fallback is local SVG and missing configured assets fail closed', async () => {
  const deps = { 'node:fs/promises': { readFile: async () => { throw Error('ENOENT'); } }, 'node:path': path, '../../../../preview-workspace/server': { requirePreviewWorkspace: async () => true } };
  const request = new Request('http://127.0.0.1/preview/flow-gallery/asset/portrait');
  const params = { params: Promise.resolve({ key: 'portrait' }) };
  const fallback = await load('app/preview/flow-gallery/asset/[key]/route.ts', deps, { FRAME_ZERO_FLOW_GALLERY_PROOF: '1' });
  const response = await fallback.GET(request, params);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.match(await response.text(), /<svg/);
  const configured = await load('app/preview/flow-gallery/asset/[key]/route.ts', deps, { FRAME_ZERO_FLOW_GALLERY_PROOF: '1', FRAME_ZERO_FLOW_GALLERY_ASSET_ROOT: '/fixture' });
  assert.equal((await configured.GET(request, params)).status, 404);
});

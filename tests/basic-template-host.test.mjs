import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));

// Run the real host/caller composition; leave template rendering and DOM effects
// to the existing template and browser suites.
function fixture({ preview = false, active = true } = {}) {
  const Renderer = () => null, Lightbox = () => null, Provider = () => null;
  const work = { code: 'fixture', title: 'Work', image: '/fixture.webp', assetId: 'fixture-asset' };
  const works = [work];
  const content = {
    activeTemplate: 'polaroid-field', profile: { brand: 'Fixture' }, social: [],
    packages: [{ title: 'Enabled', enabled: true }, { title: 'Hidden', enabled: false }],
    bookingFields: ['Time', 'Place'], templateWorks: {},
  };
  const calls = { close: [], open: [], copy: [], move: [] };
  const interactions = {
    activeWork: active ? work : null, lightboxWorks: works, copiedKey: 'contact',
    lightboxRef: { current: null }, closeButtonRef: { current: null },
    setActiveWork: value => calls.close.push(value),
    openWork: (...args) => calls.open.push(args), copyText: (...args) => calls.copy.push(args),
    moveActiveWork: value => calls.move.push(value),
  };
  const loadedModules = new Map(), hostTypes = new Set();
  const react = require('react');
  let stateIndex = 0;
  function load(relative) {
    const filename = path.join(root, relative);
    if (loadedModules.has(filename)) return loadedModules.get(filename).exports;
    const loadedModule = { exports: {} }; loadedModules.set(filename, loadedModule);
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(compiled, {
      module: loadedModule, exports: loadedModule.exports, document: { body: { nodeType: 1 } },
      require: id => {
        if (id === 'react') return { ...react, useMemo: fn => fn(), useCallback: fn => fn, useRef: () => ({ current: null }), useEffect: () => {}, useLayoutEffect: () => {}, useState: initial => [stateIndex++ === 1 && preview ? 'polaroid-field' : initial, () => {}] };
        if (id === 'react-dom' || id === 'react/jsx-runtime') return require(id);
        if (id.endsWith('basic-template-host')) {
          const loaded = load('app/templates/shared/basic-template-host.tsx');
          hostTypes.add(loaded.default); return loaded;
        }
        if (id.endsWith('template-renderer')) return { __esModule: true, default: Renderer };
        if (id.endsWith('/lightbox')) return { __esModule: true, default: Lightbox };
        if (id.endsWith('/appearance')) return { templateAppearances: { 'polaroid-field': { tone: 'light' } } };
        if (id.endsWith('use-template-interactions')) return { useTemplateInteractions: () => interactions };
        if (id.endsWith('use-template-works')) return { useTemplateWorks: () => ({ works }) };
        if (id.endsWith('assets-client')) return { hydrateSiteWorks: value => value };
        if (id.endsWith('asset-context')) return { PlatformAssetContext: { Provider } };
        if (id.endsWith('admin-provider')) return { useAdmin: () => ({ content, siteScope: { assetsEndpoint: '/api/sites/fixture/assets' } }) };
        if (id.endsWith('site-config')) return { siteConfig: content };
        if (id.endsWith('client-visible-title')) return {};
        if (id.endsWith('content-schema')) return { createEmptyBasicContent: () => structuredClone(content) };
        if (id.endsWith('/catalog')) return { templateCatalog: [{ id: 'polaroid-field', name: 'Polaroid' }] };
        if (id.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
        throw new Error(`Unexpected dependency ${id}`);
      },
    }, { filename });
    return loadedModule.exports;
  }
  function elements(value, result = []) {
    if (Array.isArray(value)) value.forEach(item => elements(item, result));
    else if (value?.props) {
      result.push(value);
      if (hostTypes.has(value.type)) elements(value.type(value.props), result);
      else elements(value.props.children, result);
    } else if (value?.children) elements(value.children, result);
    return result;
  }
  function render(file, props) {
    const loadedModule = load(file), Component = loadedModule.default ?? loadedModule.SiteBasicView;
    const tree = Component(props);
    const all = elements(tree);
    return { tree, all, renderer: all.find(item => item.type === Renderer), box: all.find(item => item.type === Lightbox) };
  }
  return { render, content, work, works, calls, interactions, Provider };
}

function assertInteractions(f, rendered, basicTemplate) {
  const { renderer, box } = rendered;
  assert.ok(renderer && box);
  assert.equal(renderer.props.copiedKey, 'contact');
  assert.equal(renderer.props.onCopy, f.interactions.copyText);
  assert.equal(renderer.props.onOpenWork, f.interactions.openWork);
  renderer.props.onBeforeViewChange();
  assert.deepEqual(f.calls.close, [null]);
  assert.equal(box.props.work, f.work);
  assert.deepEqual([...box.props.works], f.works);
  assert.equal(box.props.frameRef, f.interactions.lightboxRef);
  assert.equal(box.props.closeButtonRef, f.interactions.closeButtonRef);
  assert.equal(box.props.basicTemplate, basicTemplate);
  assert.equal(box.props.theme, 'light');
  assert.equal(box.props.appearance, 'light');
  box.props.onMove(1); box.props.onClose();
  assert.deepEqual(f.calls.move, [1]);
  assert.deepEqual(f.calls.close, [null, null]);
}

test('saved/private and public Basic retain hydrated content, resource context and interaction scope', () => {
  const f = fixture();
  const rendered = f.render('app/site-editor/basic-view.tsx', { content: f.content, assets: [{ id: 'asset', variants: { full: { src: '/api/public-sites/fixture/assets/asset/full' } } }] });
  assertInteractions(f, rendered, 'polaroid-field');
  assert.equal(rendered.renderer.props.content, f.content);
  assert.equal(rendered.renderer.props.works, f.works);
  assert.equal(rendered.renderer.props.isPreview, false);
  assert.equal(rendered.renderer.props.booted, true);
  assert.equal(rendered.renderer.props.packages.length, 1);
  assert.equal(rendered.renderer.props.bookingTemplate, '【约拍任务申请】\nTime\nPlace');
  const provider = rendered.all.find(item => item.type === f.Provider);
  assert.equal(provider.props.value.get('asset'), '/api/public-sites/fixture/assets/asset/full');
});

test('preview mapping changes reset only the renderer while native close uses the existing controller', () => {
  const f = fixture(); let closed = 0;
  const props = { templateId: 'polaroid-field', works: f.works, title: 'Preview', description: 'Unsaved', previewSource: 'draft', draftScope: 'admin', onRequestClose: () => closed++ };
  const rendered = f.render('app/admin/template-preview-dialog.tsx', props);
  assertInteractions(f, rendered, 'polaroid-field');
  assert.equal(rendered.renderer.props.content.profile, f.content.profile);
  assert.equal(rendered.renderer.props.isPreview, true);
  assert.equal(rendered.renderer.props.booted, true);
  assert.ok(rendered.renderer.key.includes('fixture'));
  const changed = f.render('app/admin/template-preview-dialog.tsx', { ...props, works: [{ ...f.work, image: '/changed.webp' }] });
  assert.notEqual(changed.renderer.key, rendered.renderer.key);
  for (const element of changed.all.filter(item => typeof item.type === 'function' && item !== changed.renderer && item !== changed.box)) {
    assert.equal(element.key, null, 'the mapping key must not remount the surrounding interaction host');
  }
  const dialog = rendered.tree.children;
  dialog.props.onCancel({ preventDefault() {} });
  assert.equal(f.calls.close.at(-1), null);
  assert.equal(closed, 0, 'Escape first closes the active photo');
  dialog.props.onClose(); assert.equal(closed, 1);
});

test('legacy portfolio keeps boot/preview state and its existing lightbox appearance', () => {
  const f = fixture({ preview: true });
  const rendered = f.render('app/test/legacy-home.tsx', {});
  assertInteractions(f, rendered, undefined);
  assert.equal(rendered.renderer.props.booted, false);
  assert.equal(rendered.renderer.props.isPreview, true);
  assert.equal(rendered.renderer.key, 'polaroid-field');
});

test('laboratory stays photo-free with inactive interactions; a closed Basic view has no lightbox', async () => {
  const f = fixture();
  const lab = f.render('app/test/template-laboratory.tsx', { templateId: 'polaroid-field' });
  assert.equal(lab.box, undefined);
  assert.equal(lab.renderer.props.works.length, 0);
  assert.equal(lab.renderer.props.packages.length, 0);
  assert.equal(lab.renderer.props.bookingTemplate, '');
  assert.equal(lab.renderer.props.copiedKey, null);
  assert.equal(lab.renderer.props.isPreview, true);
  await lab.renderer.props.onCopy('key', 'value'); lab.renderer.props.onOpenWork(f.work);
  assert.deepEqual(f.calls.copy, []); assert.deepEqual(f.calls.open, []);
  const closed = fixture({ active: false });
  assert.equal(closed.render('app/site-editor/basic-view.tsx', { content: closed.content, assets: [] }).box, undefined);
});

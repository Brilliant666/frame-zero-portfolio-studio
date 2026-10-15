import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const path = 'app/preview-workspace/admin.tsx';
const source = process.env.COLLECTION_FOCUS_BASELINE
  ? execFileSync('git', ['show', `${process.env.COLLECTION_FOCUS_BASELINE}:${path}`], { encoding: 'utf8' })
  : await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler, sectionHandler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'changeCollectionTab') handler = node.initializer.getText(parsed);
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'changeSection') sectionHandler = node.initializer.getText(parsed);
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(handler, 'Exercise the actual editor step handler');
const compiled = ts.transpileModule(`exports.change = ${handler}; exports.section = ${sectionHandler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const focusHelper = ts.transpileModule(await fs.readFile(new URL('../app/preview-workspace/use-photo-page-focus.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture(headerHeight = 76) {
  const frames = new Map(), focus = [], scroll = [];
  let nextFrame = 0;
  const header = { getBoundingClientRect: () => ({ height: headerHeight }) };
  const workspace = { querySelector: () => header };
  const context = {
    exports: {}, collectionTab: 'photos', photoScroll: { current: 0 }, collectionStepFrame: { current: 0 },
    section: 'library', siteMode: false, sectionScroll: { current: {} }, sectionFrame: { current: 0 },
    collectionPanels: { current: Object.fromEntries(['photos', 'settings', 'effect'].map(name => [name, {
      focus(options) { assert.equal(options.preventScroll, true); focus.push(name); },
      closest(selector) { return selector === 'dialog' ? null : workspace; },
      getBoundingClientRect() { return { top: (name === 'effect' ? 810 : 784) - context.window.scrollY }; },
    }])) },
    window: { scrollY: 940, scrollTo(options) { scroll.push(options.top); this.scrollY = options.top; } },
    setCollectionTab(value) { context.collectionTab = value; },
    setSection(value) { context.section = value; },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const helperContext = { exports: {}, require: () => ({}), window: context.window };
  vm.runInNewContext(focusHelper, helperContext);
  context.focusEditorRegion = helperContext.exports.focusPhotoResults;
  vm.runInNewContext(compiled, context);
  return { context, focus, scroll, change: context.exports.change, section: context.exports.section,
    tick() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); } };
}

test('next/back actions hand focus to the new panel and restore the photo scroll position', () => {
  const f = fixture();
  f.change('settings', true); f.tick();
  assert.deepEqual(f.focus, ['settings']); assert.deepEqual(f.scroll, [696]);
  f.context.window.scrollY = 250;
  f.change('effect', true); f.tick();
  f.change('photos', true); f.tick();
  assert.deepEqual(f.focus, ['settings', 'effect', 'photos']);
  assert.deepEqual(f.scroll, [696, 722, 940]);
});

test('mobile next step lands below the actual sticky header instead of the page top', () => {
  const f = fixture(128); f.change('settings', true); f.tick();
  assert.equal(f.context.collectionPanels.current.settings.getBoundingClientRect().top, 140);
  assert.deepEqual(f.focus, ['settings']);
});

test('persistent tab controls keep their own focus', () => {
  const f = fixture(); f.change('settings'); f.tick();
  assert.deepEqual(f.focus, []); assert.deepEqual(f.scroll, [0]);
});

test('rapid step switches cancel stale focus and scroll work', () => {
  const f = fixture(); f.change('settings', true); f.change('effect', true); f.tick();
  assert.deepEqual(f.focus, ['effect']); assert.deepEqual(f.scroll, [722]);
});

test('each module retains its own scroll while newly opened albums start at the top', () => {
  const f = fixture(); f.section('albums'); f.tick();
  assert.deepEqual(f.scroll, [0]);
  f.context.window.scrollY = 240;
  f.section('library'); f.tick(); assert.deepEqual(f.scroll, [0, 940]);
  f.context.window.scrollY = 940;
  f.section('collections', true); f.tick(); assert.equal(f.scroll.at(-1), 0);
  f.context.window.scrollY = 420;
  f.section('collections', true); f.tick(); assert.equal(f.scroll.at(-1), 0);
  f.section('albums'); f.tick(); assert.equal(f.scroll.at(-1), 240);
});

test('leaving the collection cancels a pending hidden step focus', () => {
  const f = fixture(); f.change('settings', true); f.section('library'); f.tick();
  assert.deepEqual(f.focus, []); assert.equal(f.scroll.length, 1);
});

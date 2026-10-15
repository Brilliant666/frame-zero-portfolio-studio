import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/preview-workspace/use-photo-page-focus.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture({ modal = false, headerHeight = 72 } = {}) {
  const refs = [], effects = [], windowMoves = [], dialogMoves = [], focusCalls = [];
  let cursor = 0, previousPage;
  const react = {
    useRef(value) { const index = cursor++; return refs[index] ??= { current: value }; },
    useLayoutEffect(callback, [page]) { if (page !== previousPage) effects.push(callback); previousPage = page; },
  };
  const header = { getBoundingClientRect: () => ({ height: headerHeight }) };
  const scope = { querySelector: () => header };
  const dialog = { ...scope, scrollTop: 1800, clientTop: 1, getBoundingClientRect: () => ({ top: 16 }), scrollTo: value => dialogMoves.push(value) };
  const results = {
    closest: selector => selector === 'dialog' ? modal ? dialog : null : scope,
    focus: options => focusCalls.push(options),
    getBoundingClientRect: () => ({ top: -1200 }),
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: () => react, window: { scrollY: 1800, scrollTo: value => windowMoves.push(value) } });
  function render(page) {
    cursor = 0;
    const result = exports.usePhotoPageFocus(page);
    result.resultsRef.current = results;
    effects.splice(0).forEach(callback => callback());
    return result;
  }
  return { render, windowMoves, dialogMoves, focusCalls };
}

test('library pagination focuses new results below the actual sticky header', () => {
  const f = fixture(); const hook = f.render(0);
  assert.equal(f.focusCalls.length, 0);
  hook.requestPageFocus(); f.render(1);
  assert.equal(f.focusCalls.length, 1);
  assert.equal(f.focusCalls[0].preventScroll, true);
  assert.equal(f.windowMoves[0].top, 516);
  assert.equal(f.windowMoves[0].behavior, 'instant');
  assert.equal(f.dialogMoves.length, 0);
});

test('picker pagination moves its dialog, never the page behind it', () => {
  const f = fixture({ modal: true, headerHeight: 108 }); const hook = f.render(0);
  hook.requestPageFocus(); f.render(1);
  assert.equal(f.dialogMoves[0].top, 463);
  assert.equal(f.windowMoves.length, 0);
  assert.equal(f.focusCalls.length, 1);
});

test('filtering, selection renders and later page clamping do not steal focus', () => {
  const f = fixture(); const hook = f.render(0);
  hook.requestPageFocus(); f.render(1);
  f.render(1); f.render(0); f.render(0);
  assert.equal(f.focusCalls.length, 1);
  assert.equal(f.windowMoves.length, 1);
});

test('a repeated explicit page action positions each newly rendered page', () => {
  const f = fixture(); let hook = f.render(0);
  for (const page of [1, 0, 1, 0]) { hook.requestPageFocus(); hook = f.render(page); }
  assert.equal(f.focusCalls.length, 4);
});

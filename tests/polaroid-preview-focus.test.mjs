import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const exports = {};
const source = await fs.readFile(new URL('../app/preview-workspace/preview-focus.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
const { restorePreviewFocus } = exports;
function fixture() {
  const frames = new Map(); let nextFrame = 0, focused = 0;
  const state = { inert: true, visible: true, hidden: false, disabled: false, modal: false };
  const page = {
    body: { isConnected: true }, activeElement: null,
    querySelectorAll() { return state.modal ? [{ getClientRects: () => [{}] }] : []; },
    defaultView: {
      requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
      cancelAnimationFrame(id) { frames.delete(id); },
      getComputedStyle() { return { visibility: state.hidden ? 'hidden' : 'visible' }; },
    },
  };
  page.activeElement = page.body;
  const target = {
    ownerDocument: page, isConnected: true,
    closest() { return state.inert ? {} : null; }, matches() { return state.disabled; },
    getClientRects() { return state.visible ? [{}] : []; },
    focus(options) { assert.equal(options.preventScroll, true); focused++; page.activeElement = target; },
  };
  return { target, page, state, frames, focusCount: () => focused, tick() { const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback()); } };
}

test('closing desktop preview waits for dock inert removal before restoring the real trigger', () => {
  const f = fixture(); restorePreviewFocus(f.target);
  f.tick(); assert.equal(f.focusCount(), 0); assert.equal(f.frames.size, 1);
  f.state.inert = false; f.state.hidden = true;
  f.tick(); assert.equal(f.focusCount(), 0, 'visibility transition must also finish');
  f.state.hidden = false; f.tick();
  assert.equal(f.focusCount(), 1); assert.equal(f.page.activeElement, f.target); assert.equal(f.frames.size, 0);
});

test('rapid reopen or unmount cancels queued restoration', () => {
  const f = fixture(); const cancel = restorePreviewFocus(f.target); f.tick();
  cancel(); f.state.inert = false; f.tick();
  assert.equal(f.focusCount(), 0); assert.equal(f.frames.size, 0);
  const removed = fixture(); restorePreviewFocus(removed.target); removed.target.isConnected = false; removed.tick();
  assert.equal(removed.focusCount(), 0); assert.equal(removed.frames.size, 0);
});

test('new modal or user-selected control takes precedence over pending preview restoration', () => {
  for (const reason of ['modal', 'focus']) {
    const f = fixture(); restorePreviewFocus(f.target); f.state.inert = false;
    if (reason === 'modal') f.state.modal = true;
    else f.page.activeElement = { isConnected: true };
    f.tick(); assert.equal(f.focusCount(), 0); assert.equal(f.frames.size, 0);
  }
});

test('unavailable trigger retries are bounded and missing triggers are safe', () => {
  const f = fixture(); restorePreviewFocus(f.target);
  for (let count = 0; count < 20; count++) f.tick();
  assert.equal(f.focusCount(), 0); assert.equal(f.frames.size, 0);
  restorePreviewFocus(null)();
});

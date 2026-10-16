import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const file = 'app/templates/shared/use-template-interactions.ts';
const source = process.env.INTERACTION_BASELINE
  ? execFileSync('git', ['show', `${process.env.INTERACTION_BASELINE}:${file}`], { encoding: 'utf8' })
  : await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const works = ['a', 'b', 'c'].map(code => ({ code, assetId: code }));

// Exercise the real hook across renders with a deterministic effect/timer clock.
// Browser checks separately cover the DOM, tab order and actual rendered controls.
function fixture() {
  const slots = [], effects = [], timers = new Map(), listeners = new Set(), locks = new Set();
  let cursor = 0, timerId = 0, result, input = works;
  const same = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback }; return slots[index].callback; },
    useEffect(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; }); },
  };
  const document = { activeElement: null, body: { classList: { add: value => locks.add(value), remove: value => locks.delete(value) } } };
  class Element {
    constructor(name) { this.name = name; }
    focus() { document.activeElement = this; }
    hasAttribute() { return false; }
  }
  const origin = new Element('photo'), close = new Element('close'), next = new Element('next');
  origin.focus();
  const window = {
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { return this.setTimeout(callback); },
    cancelAnimationFrame(id) { timers.delete(id); },
    addEventListener(type, callback) { if (type === 'keydown') listeners.add(callback); },
    removeEventListener(type, callback) { if (type === 'keydown') listeners.delete(callback); },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: () => react, window, document, HTMLElement: Element });
  const render = () => {
    cursor = 0; result = exports.useTemplateInteractions(input);
    result.closeButtonRef.current = close;
    result.lightboxRef.current = { querySelectorAll: () => [close, next] };
    effects.splice(0).forEach(effect => effect());
    return result;
  };
  const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); };
  render();
  return { document, origin, close, next, locks, tick, render,
    get result() { return result; },
    open(scope) { result.openWork(works[0], scope); render(); tick(); },
    key(key, shiftKey = false) { const event = { key, shiftKey, preventDefault() {} }; [...listeners].forEach(callback => callback(event)); render(); tick(); },
    updateWorks(value) { input = value; render(); tick(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); tick(); },
  };
}

test('opening focuses close once; repeated next actions retain the current control', () => {
  const f = fixture(); f.open();
  assert.equal(f.document.activeElement, f.close);
  f.next.focus();
  for (const expected of [works[1], works[2], works[0]]) {
    f.result.moveActiveWork(1); f.render(); f.tick();
    assert.equal(f.result.activeWork, expected);
    assert.equal(f.document.activeElement, f.next);
    assert.equal(f.locks.has('is-locked'), true);
  }
});

test('arrow navigation uses the latest scope without resetting focus', () => {
  const f = fixture(); f.open(); f.next.focus();
  f.updateWorks([works[0], works[2]]);
  f.key('ArrowRight');
  assert.equal(f.result.activeWork, works[2]);
  assert.equal(f.document.activeElement, f.next);
  f.key('ArrowLeft');
  assert.equal(f.result.activeWork, works[0]);
});

test('tab stays in the dialog and Escape returns to the original photo after browsing', () => {
  const f = fixture(); f.open(); f.key('Tab', true);
  assert.equal(f.document.activeElement, f.next);
  f.key('ArrowRight'); f.key('Tab');
  assert.equal(f.document.activeElement, f.close);
  f.key('Escape');
  assert.equal(f.result.activeWork, null);
  assert.equal(f.document.activeElement, f.origin);
  assert.equal(f.locks.size, 0);
});

test('closing before initial focus cancels the timer; reopening and unmounting release focus and lock', () => {
  const f = fixture();
  f.result.openWork(works[0]); f.render();
  f.result.setActiveWork(null); f.render(); f.tick();
  assert.equal(f.document.activeElement, f.origin);
  f.open([works[0], works[1]]); f.next.focus(); f.key('ArrowRight');
  assert.equal(f.result.activeWork, works[1]);
  f.unmount();
  assert.equal(f.document.activeElement, f.origin);
  assert.equal(f.locks.size, 0);
});

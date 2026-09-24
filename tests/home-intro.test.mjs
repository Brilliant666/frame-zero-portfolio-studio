import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/templates/polaroid-field/home-intro.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let sequence = 0;
const load = () => import('data:text/javascript;base64,' + Buffer.from(js + `\n// instance ${sequence++}`).toString('base64'));

test('opening progress reaches 100 at 950ms and long titles have bounded stagger', async () => {
  const { introProgress, titleCharacterDelay } = await load();
  assert.equal(introProgress(-50), 0);
  assert.equal(introProgress(0), 0);
  assert.equal(introProgress(950), 100);
  assert.equal(introProgress(10000), 100);
  assert.equal(titleCharacterDelay(1), 130);
  assert.equal(titleCharacterDelay(1000), 1040);
});

test('first tab visit claims once and persistent session prevents refresh replay', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = await load();
  assert.equal(first.claimHomeIntro(storage), true);
  assert.equal(first.claimHomeIntro(storage), false);
  assert.equal((await load()).claimHomeIntro(storage), false);
});

test('blocked storage falls back safely and deep-link return/reduced-motion consumes opening', async () => {
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const denied = await load();
  assert.equal(denied.claimHomeIntro(storage), true);
  assert.equal(denied.claimHomeIntro(storage), false);
  const returned = await load();
  assert.equal(returned.claimHomeIntro(null, true), false);
  assert.equal(returned.claimHomeIntro(null), false);
});

test('skip and unmount cancel pending RAF, animations and event listeners', async () => {
  const { runHomeIntro } = await load();
  const originals = Object.fromEntries(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  const listeners = new Map();
  const cancelled = [];
  const animation = { cancel() { cancelled.push('animation'); } };
  const star = { animate() { return animation; } };
  const count = { textContent: '00' };
  const overlay = { hidden: true, querySelector: selector => selector.includes('star') ? star : count, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key), focus() { globalThis.document.activeElement = overlay; } };
  const media = { matches: false, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const root = { dataset: {}, querySelector: selector => selector === '[data-home-intro]' ? overlay : null, querySelectorAll: () => [], removeAttribute() {} };
  try {
    globalThis.window = { matchMedia: () => media, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
    globalThis.document = { activeElement: null };
    globalThis.requestAnimationFrame = () => 42;
    globalThis.cancelAnimationFrame = id => cancelled.push(id);
    const dispose = runHomeIntro(root);
    assert.equal(overlay.hidden, false);
    listeners.get('click')();
    assert.equal(overlay.hidden, true);
    assert.equal(listeners.size, 0);
    assert.ok(cancelled.includes(42));
    assert.ok(cancelled.includes('animation'));
    dispose();
    assert.equal(listeners.size, 0);
  } finally {
    for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

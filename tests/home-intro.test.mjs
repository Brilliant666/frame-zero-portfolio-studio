import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/templates/polaroid-field/home-intro.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let sequence = 0;
const load = () => import('data:text/javascript;base64,' + Buffer.from(js + `\n// instance ${sequence++}`).toString('base64'));

test('long titles have bounded stagger', async () => {
  const { titleCharacterDelay } = await load();
  assert.equal(titleCharacterDelay(0), 0);
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

const withGlobals = async (globals, run) => {
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    await run();
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
};

test('pre-paint bootstrap marks only an unseen, non-deep-link, motion-allowed visit', async () => {
  const { HOME_INTRO_BOOTSTRAP, HOME_INTRO_KEY } = await load();
  const run = async ({ stored, hash = '', reduced = false, denied = false }) => {
    const dataset = {};
    await withGlobals({
      document: { documentElement: { dataset } }, location: { hash },
      matchMedia: () => ({ matches: reduced }),
      sessionStorage: { getItem: key => { if (denied) throw new Error('denied'); return key === HOME_INTRO_KEY ? stored : null; } },
    }, () => new Function(HOME_INTRO_BOOTSTRAP)());
    return dataset.starIntro;
  };
  assert.equal(await run({}), 'play');
  assert.equal(await run({ denied: true }), 'play');
  assert.equal(await run({ stored: 'seen' }), undefined);
  assert.equal(await run({ hash: '#polaroid-collection-abc' }), undefined);
  assert.equal(await run({ reduced: true }), undefined);
});

test('opening without the pre-paint mark is inert; with it, the burst follows the real rise and every handle is released', async () => {
  const { runHomeIntro } = await load();
  const listeners = new Map(), events = [], cancelled = [];
  const dataset = {};
  let finishRise;
  const rise = { finished: new Promise(resolve => { finishRise = resolve; }) };
  const spark = { style: {}, animate() { return { cancel() { cancelled.push('spark'); } }; } };
  const root = {
    querySelector: selector => selector === '[data-title-star]' ? { getBoundingClientRect: () => ({ left: 100, top: 40, width: 20, height: 20 }) } : null,
    querySelectorAll: selector => selector === '[data-intro-spark]' ? [spark, spark] : [{ getAnimations: () => [rise] }],
  };
  const media = { matches: false, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  await withGlobals({
    document: { documentElement: { dataset } },
    window: { matchMedia: () => media, dispatchEvent: event => events.push(event.type) },
    performance: { now: () => 300 },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  }, async () => {
    runHomeIntro(root)();
    assert.equal(events.length, 0); assert.equal(listeners.size, 0);

    dataset.starIntro = 'play';
    const dispose = runHomeIntro(root);
    assert.deepEqual(events, ['preview:star-boost']);
    finishRise(); await rise.finished; await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(spark.style.left, '110px'); assert.equal(spark.style.top, '50px');
    dispose(); dispose();
    assert.equal(dataset.starIntro, undefined);
    assert.equal(listeners.size, 0);
    assert.deepEqual(cancelled, ['spark', 'spark']);

    dataset.starIntro = 'play';
    runHomeIntro(root);
    listeners.get('change')?.(); assert.equal(dataset.starIntro, 'play');
    media.matches = true; listeners.get('change')();
    assert.equal(dataset.starIntro, undefined); assert.equal(listeners.size, 0);
  });
});

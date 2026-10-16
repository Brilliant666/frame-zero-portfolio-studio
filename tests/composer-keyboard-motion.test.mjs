import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const hookSource = compile(await fs.readFile(new URL("../app/templates/polaroid-field/use-composer-motion.ts", import.meta.url), "utf8"));
const mathExports = {};
vm.runInNewContext(compile(await fs.readFile(new URL("../app/templates/polaroid-field/composer-motion.ts", import.meta.url), "utf8")), { exports: mathExports });

// Execute the actual motion hook with a controlled clock. This tests scheduling
// and interruption; DOM keyboard routing remains a browser acceptance check.
function fixture({ initial = { x: 0, y: 0, scale: 1 }, reduced = false, constrain = value => value } = {}) {
  let now = 0, nextId = 0;
  const frames = new Map(), cleanups = [], activity = [];
  const view = { current: { ...initial } };
  const exports = {};
  const media = { matches: reduced, addEventListener() {}, removeEventListener() {} };
  const react = {
    useRef: value => ({ current: value }),
    useCallback: callback => callback,
    useMemo: callback => callback(),
    useLayoutEffect: callback => { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); },
  };
  vm.runInNewContext(hookSource, {
    exports,
    require(name) {
      if (name === "react") return react;
      if (name === "./composer-motion") return mathExports;
      throw new Error(`Unexpected hook dependency: ${name}`);
    },
    performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    window: { matchMedia: () => media },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
  });
  const motion = exports.useComposerMotion(view, value => { view.current = value; }, true, constrain, value => activity.push(value));
  return {
    motion, view, frames, activity,
    tick(time) {
      now = time;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback(now));
    },
    dispose() { cleanups.forEach(cleanup => cleanup()); },
  };
}

test("each repeated keyboard pan advances immediately without waiting for release", () => {
  for (const interval of [33, 50, 100]) {
    const f = fixture();
    try {
      for (let step = 1; step <= 30; step++) {
        f.motion.pan(-80, 0);
        assert.equal(f.view.current.x, -80 * step, `repeat ${step} at ${interval}ms`);
        assert.equal(f.view.current.y, 0);
        assert.equal(f.frames.size, 0, "key repeats must not restart a camera destination animation");
        f.tick(step * interval);
      }
      f.tick(5000);
      assert.equal(f.view.current.x, -2400, "release must not produce delayed extra travel");
    } finally { f.dispose(); }
  }
});

test("keyboard pan cancels an active camera move at its current position", () => {
  const f = fixture({ initial: { x: 100, y: 50, scale: 0.8 } });
  try {
    f.motion.move({ x: -1000, y: 400, scale: 1.6 }, 850);
    f.tick(220);
    const before = { ...f.view.current };
    f.motion.pan(80, -80);
    const after = { ...f.view.current };
    assert.equal(after.x, before.x + 80);
    assert.equal(after.y, before.y - 80);
    assert.equal(after.scale, before.scale, "pan does not inherit the old destination zoom");
    assert.equal(f.frames.size, 0);
    assert.equal(f.activity.at(-1), false);
    f.tick(1200);
    assert.equal(f.view.current.x, after.x);
    assert.equal(f.view.current.y, after.y);
    assert.equal(f.view.current.scale, after.scale);
  } finally { f.dispose(); }
});

test("keyboard pan stops zoom and inertia jobs before applying its step", () => {
  for (const start of [motion => motion.zoom({ x: -500, y: -200, scale: 2 }), motion => motion.release({ x: 1, y: -0.4 })]) {
    const f = fixture();
    try {
      start(f.motion);
      f.tick(32);
      const before = { ...f.view.current };
      f.motion.pan(-80, 80);
      assert.equal(f.view.current.x, before.x - 80);
      assert.equal(f.view.current.y, before.y + 80);
      assert.equal(f.view.current.scale, before.scale);
      assert.equal(f.frames.size, 0);
      f.tick(1000);
      assert.equal(f.view.current.x, before.x - 80);
      assert.equal(f.view.current.y, before.y + 80);
    } finally { f.dispose(); }
  }
});

test("keyboard pan respects camera bounds and reverses from the actual clamped position", () => {
  const bounds = { left: 0, top: 0, right: 2000, bottom: 1500 };
  const constrain = value => mathExports.constrainComposer(value, bounds, 1000, 800);
  const f = fixture({ initial: { x: 0, y: 0, scale: 0.8 }, constrain });
  try {
    for (let step = 0; step < 100; step++) f.motion.pan(-80, 80);
    const bounded = constrain({ x: -100000, y: 100000, scale: 0.8 });
    assert.equal(f.view.current.x, bounded.x);
    assert.equal(f.view.current.y, bounded.y);
    assert.equal(f.view.current.scale, 0.8);
    f.motion.pan(80, -80);
    assert.equal(f.view.current.x, bounded.x + 80);
    assert.equal(f.view.current.y, bounded.y - 80);
    assert.equal(f.frames.size, 0, "hitting a boundary must not accumulate a queued destination");
  } finally { f.dispose(); }
});

test("reduced-motion mode keeps keyboard pan immediate and leaves destination moves usable", () => {
  const f = fixture({ reduced: true, initial: { x: 5, y: 10, scale: 0.6 } });
  try {
    f.motion.pan(0, -80);
    f.motion.pan(80, 0);
    assert.equal(f.view.current.x, 85);
    assert.equal(f.view.current.y, -70);
    assert.equal(f.view.current.scale, 0.6);
    assert.equal(f.frames.size, 0);
    f.motion.move({ x: -200, y: 300, scale: 0.9 });
    assert.equal(f.view.current.x, -200);
    assert.equal(f.view.current.y, 300);
    assert.equal(f.view.current.scale, 0.9);
    assert.equal(f.frames.size, 0);
  } finally { f.dispose(); }
});

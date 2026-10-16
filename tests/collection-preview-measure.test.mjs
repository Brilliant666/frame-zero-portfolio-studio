import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const path = 'app/preview-workspace/collection-live-preview.tsx';
const source = process.env.COLLECTION_FOCUS_BASELINE
  ? execFileSync('git', ['show', `${process.env.COLLECTION_FOCUS_BASELINE}:${path}`], { encoding: 'utf8' })
  : await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'useLayoutEffect') effect = node.getText(parsed);
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(effect, 'Exercise the real preview measurement effect and dependencies');
const compiled = ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  let dependencies, cleanup, dimensions = { width: 0, height: 520 };
  const observers = [];
  const context = {
    active: false, viewport: { current: { clientWidth: 0 } }, canvas: { current: { offsetHeight: 0 } },
    setDimensions(update) { dimensions = update(dimensions); },
    useLayoutEffect(callback, next) {
      if (dependencies && next.length === dependencies.length && next.every((value, i) => Object.is(value, dependencies[i]))) return;
      cleanup?.(); dependencies = next; cleanup = callback();
    },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  };
  vm.createContext(context);
  const render = () => vm.runInContext(compiled, context);
  render();
  return { context, observers, get dimensions() { return dimensions; },
    show(width, height) { context.active = true; context.viewport.current.clientWidth = width; context.canvas.current.offsetHeight = height; render(); },
    hide() { context.active = false; context.viewport.current.clientWidth = 0; context.canvas.current.offsetHeight = 0; render(); },
  };
}

test('a hidden preview does not replace its initial dimensions with zero', () => {
  const f = fixture(); assert.equal(f.dimensions.height, 520); assert.equal(f.observers.length, 0);
});

test('showing the preview measures synchronously and preserves dimensions while hidden', () => {
  const f = fixture(); f.show(320, 520);
  assert.equal(f.dimensions.width, 320); assert.equal(f.dimensions.height, 520);
  f.hide(); assert.equal(f.observers[0].disconnected, true);
  assert.equal(f.dimensions.width, 320); assert.equal(f.dimensions.height, 520);
  f.show(260, 640);
  assert.equal(f.dimensions.width, 260); assert.equal(f.dimensions.height, 640);
});

test('a late zero-size observation cannot collapse the preview before the next reveal', () => {
  const f = fixture(); f.show(320, 520); const pending = f.observers[0].callback;
  f.hide(); pending();
  assert.equal(f.dimensions.width, 320); assert.equal(f.dimensions.height, 520);
});

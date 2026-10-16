import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const path = 'app/preview-workspace/collection-member-editor.tsx';
const source = process.env.COLLECTION_FOCUS_BASELINE
  ? execFileSync('git', ['show', `${process.env.COLLECTION_FOCUS_BASELINE}:${path}`], { encoding: 'utf8' })
  : await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const order = { exports: {} };
vm.runInNewContext(compile(await fs.readFile(new URL('../app/preview-workspace/collection-member-order.ts', import.meta.url), 'utf8')), order);

// Run the real component handlers. Browser checks cover native focus and geometry.
function fixture() {
  const slots = [], effects = [], frames = new Map(), timers = new Map(), cards = new Map();
  let cursor = 0, nextId = 0, tree, collection = { id: 'album', assetIds: ['a', 'b', 'c'] }, undoControl;
  const document = { body: {}, activeElement: null };
  document.activeElement = document.body;
  const same = (a, b) => a && a.length === b.length && a.every((entry, i) => Object.is(entry, b[i]));
  const react = {
    useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useId() { return `id-${cursor++}`; },
    useMemo(callback, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: callback() }; return slots[i].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; }); },
  };
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, document, window: { addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'react-dom') return { createPortal: node => node };
      if (name === './collection-member-order') return order.exports;
      return { default: {} };
    },
  };
  vm.runInNewContext(compile(source), context);
  function walk(node, callback) {
    if (Array.isArray(node)) return node.forEach(child => walk(child, callback));
    if (!node || typeof node !== 'object') return;
    callback(node); walk(node.props?.children, callback);
  }
  const render = () => {
    cursor = 0;
    tree = context.exports.default({ collection, assets: [], onChange(next) { collection = next; }, onView() {} });
    const oldUndo = undoControl; undoControl = null;
    walk(tree, node => {
      if (node.props?.['data-member-id']) {
        const id = node.props['data-member-id'];
        if (!cards.has(id)) cards.set(id, { id, revealed: 0, getClientRects: () => [{}],
          getBoundingClientRect: () => ({ top: 0 }), focus() { document.activeElement = this; }, scrollIntoView() { this.revealed++; } });
        const card = cards.get(id); card.handler = node.props.onKeyDown; node.props.ref?.(card);
      }
      if (node.type === 'ol') node.props.ref.current = { children: [...cards.values()], addEventListener() {}, removeEventListener() {} };
      if (node.type === 'button' && node.props.children === '撤销最近移动') {
        undoControl = oldUndo ?? {}; undoControl.onClick = node.props.onClick;
        if (node.props.ref) node.props.ref.current = undoControl;
      }
    });
    if (oldUndo && !undoControl && document.activeElement === oldUndo) document.activeElement = document.body;
    effects.splice(0).forEach(effect => effect());
  };
  const tick = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  render();
  return { document, cards, render, tick, get collection() { return collection; },
    move(id, key) { const card = cards.get(id); document.activeElement = card; card.handler({ target: card, currentTarget: card, key, preventDefault() {} }); render(); tick(); },
    focusUndo() { document.activeElement = undoControl; },
    undo() { this.focusUndo(); undoControl.onClick(); render(); tick(); },
    expire() { for (const [id, timer] of timers) if (timer.delay === 12000) { timers.delete(id); timer.callback(); } render(); tick(); },
  };
}

test('undo returns focus to the moved photo after its original order is restored', () => {
  const f = fixture(); f.move('c', 'Home');
  assert.equal(f.collection.assetIds.join(','), 'c,a,b');
  f.undo();
  assert.equal(f.collection.assetIds.join(','), 'a,b,c');
  assert.equal(f.document.activeElement, f.cards.get('c'));
  assert.ok(f.cards.get('c').revealed > 0);
});

test('expiring a focused undo action hands focus back without undoing the order', () => {
  const f = fixture(); f.move('b', 'End'); f.focusUndo(); f.expire();
  assert.equal(f.document.activeElement, f.cards.get('b'));
  assert.equal(f.collection.assetIds.join(','), 'a,c,b');
});

test('expiry does not steal focus from another photo', () => {
  const f = fixture(); f.move('c', 'Home'); f.cards.get('a').focus(); f.expire();
  assert.equal(f.document.activeElement, f.cards.get('a'));
});

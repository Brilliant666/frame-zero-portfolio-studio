import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function plainModule(file) {
  const exports = {};
  const source = await fs.readFile(new URL(`../app/site-editor/${file}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
  return exports;
}
const stateHelpers = await plainModule('publication-state.ts');
const feedbackHelpers = await plainModule('publication-feedback.ts');
const source = await fs.readFile(new URL('../app/site-editor/publication-controls.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const current = { id: 'published-old', space: 'premium-polaroid', templateId: 'premium-polaroid', draftRevision: 2, publishedAt: '2026-10-09T00:00:00Z' };
const next = { ...current, id: 'published-new', draftRevision: 3 };

// Execute actual event handlers and effects with controlled read/write transports.
// Native dialog focus traps and responsive layout still require browser coverage.
function harness(transport = async () => ({ response: { ok: true, status: 200 }, body: { current, history: [current] } })) {
  const slots = [], effects = [], timers = new Map(); let cursor = 0, timerId = 0;
  const changed = (previous, deps) => !previous || deps.some((value, index) => !Object.is(value, previous[index]));
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { callback, deps }; return slots[index].callback; },
    useEffect(callback, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); }); } },
    useId() { const index = cursor++; return `fixture-${index}`; },
  };
  const exports = {}, calls = [];
  const visibility = { modalOpen: false, keyboardOpen: false };
  vm.runInNewContext(compiled, { exports, AbortController, confirm: () => true, window: { setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, clearTimeout(id) { timers.delete(id); } }, require(id) {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (id.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (id === './publication-state') return stateHelpers;
    if (id === './publication-feedback') return feedbackHelpers;
    if (id === './draft-save') return { editorJson: async (...args) => { calls.push(args); return transport(...args); } };
    if (id === './content-schema') return { isContentSpace: value => ['basic', 'premium-polaroid', 'premium-flow-gallery'].includes(value) };
    if (id === '../templates/catalog') return { templateCatalog: [] };
    if (id === './use-editor-action-visibility') return { useEditorActionVisibility: () => visibility };
    throw Error(`Unexpected import ${id}`);
  } });
  return {
    render(props = {}) { cursor = 0; return exports.default({ endpoint: '/fixture/publication/premium-polaroid', publicHref: '/fixture', space: 'premium-polaroid', revision: 2, templateId: 'premium-polaroid', dirty: false, disabled: false, saveDraft: async () => ({ revision: 3 }), ...props }); },
    async effects() { while (effects.length) effects.shift()(); await flush(); },
    timers, calls, visibility,
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
  return null;
}
function text(node) {
  if (node == null || node === false) return '';
  if (typeof node !== 'object') return String(node);
  return [node.props?.children].flat(Infinity).map(text).join(' ');
}
const button = (tree, label) => find(tree, node => node.type === 'button' && text(node) === label);

test('success detail follows latest dirty and synchronized state, without a stale request warning', () => {
  const base = '发布成功：高级拍立得 · v3。';
  const detail = feedbackHelpers.publicationSuccessDetail;
  assert.equal(detail(base, true, false, true), base);
  assert.match(detail(base, true, true, false), /仍有未保存修改，尚未发布/);
  assert.match(detail(base, true, false, false), /当前草稿还有待发布改动/);
  assert.equal(detail(base, true, false, true), base, 'saving and publishing the remaining edit removes the old warning');
  assert.equal(detail('已恢复公开版本', false, true, false), '已恢复公开版本');
});

test('Polaroid uses separate draft/public status, preview affordances, more tools and a native history dialog', async () => {
  const ui = harness();
  const props = { presentation: 'polaroid', previewAction: { type: 'button', props: { children: '预览当前编辑' } }, savedPreviewHref: '/fixture/preview', tools: { type: 'button', props: { children: '导出草稿' } } };
  ui.render(props); await ui.effects();
  const tree = ui.render(props);
  assert.match(text(tree), /草稿/);
  assert.doesNotMatch(text(tree), /草稿 v| · v2/);
  assert.ok(find(tree, node => node.props?.title === '草稿版本 v2'));
  assert.match(text(tree), /最近 10 个不同内容版本/);
  assert.ok(find(tree, node => node.type === 'time' && node.props.dateTime === current.publishedAt));
  assert.match(text(tree), /当前公开：高级拍立得/);
  assert.match(text(tree), /无待发布改动/);
  const more = find(tree, node => typeof node.type === 'function' && node.props.label === '更多 ⋯');
  assert.ok(more);
  assert.ok(button(more, '导出草稿'));
  assert.ok(button(more, '刷新公开状态'));
  assert.equal(find(more, node => node.type === 'a' && node.props.href === '/fixture'), null, 'public navigation is not hidden in More');
  const toolbar = find(tree, node => node.props?.className === 'compactTools');
  const publicLink = find(toolbar, node => node.type === 'a' && node.props.href === '/fixture');
  assert.ok(publicLink, 'public navigation remains a direct status-bar action');
  assert.equal(publicLink.props.target, '_blank');
  assert.equal(publicLink.props.rel, 'noopener noreferrer');
  const saved = find(tree, node => node.type === 'a' && node.props.href === '/fixture/preview');
  assert.equal(saved.props.target, '_blank');
  assert.equal(saved.props.rel, 'noopener noreferrer');
  const dialog = find(tree, node => node.type === 'dialog');
  assert.ok(dialog.props['aria-labelledby']);
  assert.equal(dialog.props.open, undefined, 'history is closed initially');
  let opens = 0, closes = 0, focused = 0, prevented = 0;
  const trigger = find(tree, node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog');
  trigger.props.ref.current = { focus() { focused++; } };
  dialog.props.ref.current = { showModal() { opens++; }, close() { closes++; dialog.props.onClose(); } };
  trigger.props.onClick(); assert.equal(opens, 1);
  dialog.props.onCancel({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1); assert.equal(closes, 1); assert.equal(focused, 1);
  button(tree, '×').props.onClick(); assert.equal(closes, 2); assert.equal(focused, 2);
});

test('default basic and Flow presentation keep their original tool/history layout', async () => {
  for (const space of ['basic', 'premium-flow-gallery']) {
    const ui = harness(); const props = { space, compactTools: true };
    ui.render(props); await ui.effects(); const tree = ui.render(props);
    assert.equal(find(tree, node => node.type === 'dialog'), null);
    assert.ok(find(tree, node => node.type === 'details' && node.props.className === 'history'));
    assert.ok(find(tree, node => node.type === 'details' && node.props.className === 'toolDisclosure'));
    assert.ok(button(tree, '刷新公开状态'));
  }
});

test('publish retains receipt/version request semantics, clears parent feedback, and uses current editor state', async () => {
  let finish, committed = false; const response = new Promise(resolve => { finish = resolve; });
  const ui = harness(async (_, options) => options.method === 'POST' ? response : { response: { ok: true, status: 200 }, body: { current: committed ? next : current, history: committed ? [next, current] : [current] } });
  let started = 0, saves = 0;
  const props = { presentation: 'polaroid', dirty: true, onPublishStart: () => { started++; }, saveDraft: async () => { saves++; return { revision: 3 }; } };
  ui.render(props); await ui.effects();
  button(ui.render(props), '保存并发布').props.onClick(); await flush();
  assert.equal(started, 1); assert.equal(saves, 1);
  const post = ui.calls.find(([, options]) => options.method === 'POST');
  assert.deepEqual(JSON.parse(post[1].body), { action: 'publish', expectedDraftRevision: 3, expectedPublicationId: 'published-old' });
  committed = true; finish({ response: { ok: true, status: 200 }, body: { publication: next } }); await flush();
  let tree = ui.render({ ...props, revision: 3, dirty: false });
  const feedback = () => find(tree, node => node.props?.role === 'status');
  assert.match(text(feedback()), /发布成功/);
  assert.doesNotMatch(text(feedback()), /未保存|待发布改动/);
  tree = ui.render({ ...props, revision: 3, dirty: true });
  assert.match(text(feedback()), /仍有未保存修改/);
  tree = ui.render({ ...props, revision: 3, dirty: false });
  assert.doesNotMatch(text(feedback()), /未保存/);
  tree = ui.render({ ...props, revision: 4, dirty: false });
  assert.match(text(feedback()), /当前草稿还有待发布改动/);
  assert.match(text(tree), /草稿尚未发布/);
  assert.doesNotMatch(text(tree), /无待发布改动|全部一致/);
  await ui.effects();
  assert.equal(ui.timers.size, 1); const timer = [...ui.timers.values()][0]; assert.equal(timer.delay, 6000);
  timer.callback(); tree = ui.render({ ...props, revision: 3, dirty: false });
  assert.equal(find(tree, node => node.props?.role === 'status'), null);
});

test('history rollback preserves dirty draft status without labeling it a new publish edit', async () => {
  let saves = 0;
  const ui = harness(async (_, options) => options.method === 'POST'
    ? { response: { ok: true, status: 200 }, body: { publication: current } }
    : { response: { ok: true, status: 200 }, body: { current: next, history: [next, current] } });
  const props = { presentation: 'polaroid', revision: 4, dirty: true, saveDraft: async () => { saves++; return { revision: 5 }; } };
  ui.render(props); await ui.effects();
  const before = ui.render(props);
  button(before, '恢复此公开版本').props.onClick(); await flush();
  const after = ui.render(props);
  assert.equal(saves, 0, 'rollback does not save the current editor contents');
  const post = ui.calls.find(([, options]) => options.method === 'POST');
  assert.deepEqual(JSON.parse(post[1].body), { action: 'rollback', revisionId: 'published-old', expectedPublicationId: 'published-new' });
  const feedback = find(after, node => node.props?.role === 'status');
  assert.match(text(feedback), /已恢复公开版本.*当前草稿保持不变/);
  assert.doesNotMatch(text(feedback), /请求期间|仍有未保存修改|当前草稿还有待发布改动/);
  assert.match(text(after), /有修改未保存/);
  assert.doesNotMatch(text(after), /无待发布改动/);
});

test('failed publication stays visible with a direct refresh recovery instead of a success timer', async () => {
  const ui = harness(async (_, options) => options.method === 'POST' ? { response: { ok: false, status: 409 }, body: {} } : { response: { ok: true, status: 200 }, body: { current, history: [current] } });
  const props = { presentation: 'polaroid', dirty: true };
  ui.render(props); await ui.effects(); button(ui.render(props), '保存并发布').props.onClick(); await flush();
  const tree = ui.render(props); await ui.effects();
  assert.match(text(find(tree, node => node.props?.role === 'alert')), /发布被拒绝（409）/);
  const more = find(tree, node => typeof node.type === 'function' && node.props.label === '更多 ⋯');
  assert.equal(button(more, '刷新公开状态'), null);
  assert.ok(button(tree, '刷新公开状态'));
  assert.equal(ui.timers.size, 0);
});

test('the new action dock preserves modal and keyboard visibility signals', () => {
  const ui = harness(); ui.visibility.modalOpen = true; ui.visibility.keyboardOpen = true;
  const tree = ui.render({ presentation: 'polaroid' });
  const actions = find(tree, node => node.props?.['data-editor-save-actions'] === 'true');
  assert.equal(actions.props['data-modal-open'], true);
  assert.equal(actions.props['data-keyboard-open'], true);
  assert.equal(actions.props.inert, true);
});

test('deduplicated publish still sends guarded POST and displays already published without adding history', async () => {
  const matched = { ...current, matchedDraftRevision: 3, outcome: 'unchanged' };
  let writes = 0;
  const ui = harness(async (_, options) => {
    if (options.method === 'POST') { writes++; return { response: { ok: true, status: 200 }, body: { publication: matched } }; }
    return { response: { ok: true, status: 200 }, body: { current: matched, history: [matched] } };
  });
  const props = { presentation: 'polaroid', revision: 3 };
  ui.render(props); await ui.effects();
  assert.match(text(ui.render(props)), /无待发布改动/);
  button(ui.render(props), '保存并发布').props.onClick(); await flush();
  const tree = ui.render(props);
  assert.equal(writes, 1, 'even a synchronized client sends the guarded server request');
  assert.match(text(find(tree, node => node.props?.role === 'status')), /当前内容已发布，没有新增重复记录/);
  assert.match(text(tree), /发布记录\s+1/);
  assert.equal(ui.calls.filter(([, options]) => options.method !== 'POST').length, 2);
});

test('lost deduplicated response is reconciled from authoritative content equality at the unchanged pointer', async () => {
  let posted = false;
  const matched = { ...current, matchedDraftRevision: 3 };
  const ui = harness(async (_, options) => {
    if (options.method === 'POST') { posted = true; throw Error('lost response'); }
    return { response: { ok: true, status: 200 }, body: { current: posted ? matched : current, history: [current] } };
  });
  const props = { presentation: 'polaroid', revision: 3 };
  ui.render(props); await ui.effects(); button(ui.render(props), '保存并发布').props.onClick(); await flush();
  const tree = ui.render(props);
  assert.match(text(find(tree, node => node.props?.role === 'status')), /已确认目标版本当前公开/);
  assert.match(text(tree), /无待发布改动/);
  assert.equal(ui.calls.filter(([, options]) => options.method === 'POST').length, 1);
});

test('confirmed publish refreshes retained history and a read failure does not report publish failure', async () => {
  for (const readFails of [false, true]) {
    let posted = false;
    const ui = harness(async (_, options) => {
      if (options.method === 'POST') { posted = true; return { response: { ok: true, status: 200 }, body: { publication: next } }; }
      if (posted && readFails) throw Error('history unavailable');
      return { response: { ok: true, status: 200 }, body: { current: posted ? next : current, history: posted ? [next] : [current] } };
    });
    const props = { presentation: 'polaroid', revision: 3 };
    ui.render(props); await ui.effects(); button(ui.render(props), '保存并发布').props.onClick(); await flush();
    const tree = ui.render(props);
    assert.match(text(find(tree, node => node.props?.role === 'status')), /发布成功/);
    assert.equal(find(tree, node => node.props?.role === 'alert'), null);
    if (!readFails) assert.match(text(tree), /发布记录\s+1/);
    assert.equal(ui.calls.filter(([, options]) => options.method === 'POST').length, 1);
  }
});

test('saved revision refresh uses its own abort controller and never aborts an active publication', async () => {
  let finish, posted = false;
  const delayed = new Promise(resolve => { finish = resolve; });
  const ui = harness(async (_, options) => {
    if (options.method === 'POST') { posted = true; return delayed; }
    return { response: { ok: true, status: 200 }, body: { current: posted ? next : { ...current, matchedDraftRevision: 3 }, history: [current] } };
  });
  const props = { presentation: 'polaroid' };
  ui.render(props); await ui.effects();
  ui.render({ ...props, revision: 3 }); await ui.effects();
  assert.match(text(ui.render({ ...props, revision: 3 })), /无待发布改动/);
  button(ui.render({ ...props, revision: 3 }), '保存并发布').props.onClick(); await flush();
  const post = ui.calls.find(([, options]) => options.method === 'POST');
  ui.render({ ...props, revision: 4 }); await ui.effects();
  assert.equal(post[2].aborted, false);
  finish({ response: { ok: true, status: 200 }, body: { publication: next } }); await flush();
  assert.match(text(find(ui.render({ ...props, revision: 4 }), node => node.props?.role === 'status')), /发布成功/);
});

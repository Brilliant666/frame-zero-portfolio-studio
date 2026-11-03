import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/site-editor/use-site-draft.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const draft = title => ({ title, nested: { text: title } });
const receipt = (content, revision = 3) => ({ content, revision, updatedAt: '2026-11-03T00:00:00.000Z' });
const response = (content = draft('loaded'), revision = 2) => ({ response: { ok: true, status: 200 }, body: receipt(content, revision) });
class DraftSaveRejected extends Error {
  constructor(status) { super('Rejected'); this.status = status; }
}
class DraftSaveUncertain extends Error {
  constructor(pending) { super('Uncertain'); this.pending = pending; }
}
function fixture(overrides = {}) {
  const calls = [], observed = [], exports = {};
  const adapter = {
    decodeLoad: body => ({ draft: body.content, baseline: JSON.stringify(body.content), revision: body.revision, updatedAt: body.updatedAt }),
    prepare: value => value,
    accept: (submitted, current, saved) => {
      observed.push({ submitted, current, saved });
      const changedWhileSaving = JSON.stringify(current) !== JSON.stringify(submitted);
      return { draft: changedWhileSaving ? current : structuredClone(saved.content), baseline: JSON.stringify(saved.content), changedWhileSaving };
    },
    dirty: (value, baseline) => JSON.stringify(value) !== baseline,
    ...overrides.adapter,
  };
  const transport = {
    DraftSaveRejected, DraftSaveUncertain,
    editorJson: async (endpoint, init, signal) => {
      calls.push({ method: 'GET', endpoint, init, signal });
      return overrides.read ? overrides.read(signal) : response();
    },
    writeSiteDraft: async (endpoint, space, pending, signal) => {
      calls.push({ method: 'PUT', endpoint, space, pending, signal });
      return overrides.write ? overrides.write(pending, signal) : receipt(pending.content);
    },
    confirmDraftSave: async (endpoint, space, pending, signal) => {
      calls.push({ method: 'GET-check', endpoint, space, pending, signal });
      return overrides.confirm ? overrides.confirm(pending, signal) : { ...receipt(pending.content), confirmedAfterLoss: true };
    },
  };
  vm.runInNewContext(compiled, { exports, require: name => {
    if (name === 'react') return {};
    if (name === './draft-save') return transport;
    throw new Error(`Unexpected module: ${name}`);
  }, AbortController, DOMException, structuredClone });
  const session = exports.createSiteDraftSession({ endpoint: '/api/sites/test/drafts/basic', space: 'basic', initial: () => ({ draft: draft('initial'), baseline: '' }), adapter });
  session.activate();
  return { ...exports, session, adapter, calls, observed };
}
async function ready(options) {
  const f = fixture(options);
  assert.equal((await f.session.reload()).status, 'loaded');
  return f;
}

test('activation is idempotent; caller loads once and adapter changes do not reload', async () => {
  const { session, adapter, calls, createSiteDraftSession } = fixture();
  const beforeMount = createSiteDraftSession({ endpoint: '/api/sites/test/drafts/basic', space: 'basic', initial: () => ({ draft: draft('initial'), baseline: '' }), adapter });
  const earlyEdit = draft('before activation');
  beforeMount.setDraft(earlyEdit);
  beforeMount.activate();
  assert.equal(beforeMount.current.current, earlyEdit, 'Initial activation must preserve early edits');
  beforeMount.deactivate();
  const current = session.current, lifetime = session.lifetime;
  session.activate();
  assert.equal(calls.length, 0);
  assert.equal(session.getSnapshot().loadState, 'loading');
  assert.equal((await session.save()).status, 'ignored');
  assert.equal((await session.reload()).status, 'loaded');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].signal.aborted, false);
  assert.equal(session.current, current);
  assert.equal(session.lifetime, lifetime);
  session.setAdapter({ ...adapter, prepare: value => ({ ...value, title: 'latest adapter' }), dirty: () => false });
  assert.equal(calls.length, 1);
  assert.equal((await session.save()).status, 'saved', 'Caller owns the clean-draft guard');
  assert.equal(calls[1].pending.content.title, 'latest adapter');
});

test('latest reload wins and stale responses never enter decoder', async () => {
  const first = deferred(), second = deferred(), decoded = [];
  let reads = 0;
  const { session } = fixture({ read: () => (++reads === 1 ? first.promise : second.promise), adapter: { decodeLoad: body => {
    decoded.push(body.content.title);
    return { draft: body.content, baseline: body.content.title, revision: body.revision, updatedAt: body.updatedAt };
  } } });
  const a = session.reload(), b = session.reload();
  second.resolve(response(draft('latest'), 5));
  assert.equal((await b).status, 'loaded');
  const accepted = session.current.current;
  first.resolve(response(draft('old')));
  assert.equal((await a).status, 'ignored');
  assert.equal(session.current.current, accepted);
  assert.equal(session.getSnapshot().revision, 5);
  assert.deepEqual(decoded, ['latest']);
});

test('edits during GET and asynchronous hydration reject load without replacing edits', async () => {
  for (const hydrate of [false, true]) {
    const wait = deferred(), entered = deferred();
    const { session, DraftLoadChanged } = fixture(hydrate ? { adapter: { decodeLoad: async () => { entered.resolve(); return wait.promise; } } } : { read: () => wait.promise });
    const loading = session.reload();
    if (hydrate) await entered.promise;
    const edit = draft('local edit');
    session.setDraft(edit);
    wait.resolve(hydrate ? { draft: draft('old hydration'), baseline: '', revision: 2, updatedAt: null } : response());
    const result = await loading;
    assert.equal(result.status, 'error');
    assert.ok(result.error instanceof DraftLoadChanged);
    assert.equal(session.current.current, edit);
    assert.equal(session.getSnapshot().draft, edit);
    assert.equal(session.getSnapshot().loadState, 'error');
    assert.equal((await session.save()).status, 'ignored');
  }
});

test('load status and decoding failures preserve draft identity', async () => {
  const rejected = fixture({ read: async () => ({ response: { ok: false, status: 401 }, body: null }), adapter: { decodeLoad: () => { throw new Error('Must not decode a rejection'); } } });
  const before = rejected.session.current.current;
  const result = await rejected.session.reload();
  assert.ok(result.error instanceof rejected.DraftLoadRejected);
  assert.equal(result.error.status, 401);
  assert.equal(rejected.session.current.current, before);
  const late = deferred();
  const denied = fixture({ read: () => late.promise, adapter: { decodeLoad: () => { throw new Error('Must not decode a rejection'); } } });
  const loading = denied.session.reload();
  const edit = draft('edited before 403');
  denied.session.setDraft(edit);
  late.resolve({ response: { ok: false, status: 403 }, body: null });
  const refusal = await loading;
  assert.equal(refusal.status, 'error');
  assert.ok(refusal.error instanceof denied.DraftLoadRejected, 'HTTP rejection must survive concurrent edits for authorization cleanup');
  assert.equal(refusal.error.status, 403);
  assert.equal(denied.session.current.current, edit);
  const failure = new Error('Invalid content');
  const broken = fixture({ adapter: { decodeLoad: () => { throw failure; } } });
  const original = broken.session.current.current;
  assert.equal((await broken.session.reload()).error, failure);
  assert.equal(broken.session.current.current, original);
});

test('save synchronously locks duplicates and binds an immutable snapshot', async () => {
  const ack = deferred();
  const { session, calls } = await ready({ write: () => ack.promise });
  const local = draft('submitted');
  session.setDraft(local);
  session.subscribe(() => assert.equal(session.current.current, session.getSnapshot().draft));
  const saving = session.save();
  assert.equal(session.getSnapshot().saving, true);
  assert.equal((await session.save()).status, 'ignored');
  assert.equal((await session.checkSave()).status, 'ignored');
  assert.equal((await session.reload()).status, 'ignored');
  const sent = calls[1].pending;
  assert.equal(sent.expectedRevision, 2);
  assert.notEqual(sent.content, local);
  assert.notEqual(sent.content.nested, local.nested);
  assert.throws(() => { sent.content.nested.text = 'tampered'; }, TypeError);
  local.nested.text = 'mutated caller object';
  assert.equal(sent.content.nested.text, 'submitted');
  ack.resolve(receipt(sent.content));
  assert.equal((await saving).status, 'saved');
  assert.equal(calls.length, 2);
  assert.equal(session.getSnapshot().saving, false);
});

test('a delayed acknowledgement advances baseline while preserving newer edits', async () => {
  const ack = deferred();
  const { session, calls, observed } = await ready({ write: () => ack.promise });
  session.setDraft(draft('submitted'));
  const saving = session.save();
  const newer = draft('newer');
  session.setDraft(() => newer);
  ack.resolve(receipt(calls[1].pending.content));
  const result = await saving;
  assert.equal(result.status, 'saved');
  assert.equal(result.changedWhileSaving, true);
  assert.equal(session.current.current, newer);
  assert.equal(observed[0].current, newer);
  assert.equal(observed[0].submitted.title, 'submitted');
  assert.equal(session.getSnapshot().baseline, JSON.stringify(draft('submitted')));
  assert.equal(session.getSnapshot().revision, 3);
  assert.equal(session.getSnapshot().updatedAt, result.receipt.updatedAt);
  assert.equal(calls.filter(call => call.method === 'PUT').length, 1);
});

test('409 blocks further saves until reload; other rejections retain status without retry', async () => {
  for (const status of [409, 403]) {
    const failure = new DraftSaveRejected(status);
    const { session, calls } = await ready({ write: async () => { throw failure; } });
    const original = session.current.current;
    assert.equal((await session.save()).error, failure);
    assert.equal(session.current.current, original);
    assert.equal(session.getSnapshot().conflict, status === 409);
    assert.equal(session.getSnapshot().pending, null);
    assert.equal(calls.length, 2);
    if (status === 409) {
      assert.equal((await session.save()).status, 'ignored');
      assert.equal((await session.checkSave()).status, 'ignored');
      assert.equal((await session.reload()).status, 'loaded');
      assert.equal(session.getSnapshot().conflict, false);
    }
  }
});

test('pending confirmation remains GET-only across ready, failed, and ongoing reloads', async () => {
  for (const loadState of ['ready', 'error', 'loading']) {
    const check = deferred(), reloading = deferred();
    let confirmations = 0, reads = 0, pendingError;
    const { session, calls, observed } = await ready({
      read: async () => ++reads === 1 ? response() : loadState === 'error' ? { response: { ok: false, status: 503 }, body: null } : reloading.promise,
      write: async pending => { pendingError = new DraftSaveUncertain(pending); throw pendingError; },
      confirm: pending => ++confirmations === 1 ? Promise.reject(new DraftSaveUncertain(pending)) : check.promise,
    });
    const original = session.current.current;
    assert.equal((await session.save()).error, pendingError);
    const pending = session.getSnapshot().pending;
    assert.equal(pending, pendingError.pending);
    assert.equal(session.current.current, original);
    let reload;
    if (loadState !== 'ready') {
      reload = session.reload();
      if (loadState === 'error') assert.equal((await reload).error.status, 503);
    }
    assert.equal(session.getSnapshot().loadState, loadState);
    assert.equal((await session.save()).status, 'ignored');
    assert.equal((await session.checkSave()).status, 'error', 'A pending check must remain available after a failed or ongoing reload');
    assert.equal(session.getSnapshot().pending, pending);
    assert.equal(session.getSnapshot().loadState, loadState, 'Failed confirmation must preserve the load state');
    const checking = session.checkSave();
    assert.equal((await session.checkSave()).status, 'ignored');
    assert.equal((await session.save()).status, 'ignored');
    const newer = draft('edit while confirming');
    session.setDraft(newer);
    check.resolve({ ...receipt(pending.content), confirmedAfterLoss: true });
    const result = await checking;
    assert.equal(result.status, 'saved');
    assert.equal(result.receipt.confirmedAfterLoss, true);
    assert.equal(result.changedWhileSaving, true);
    assert.equal(observed[0].submitted, pending.content);
    assert.equal(session.current.current, newer);
    assert.equal(session.getSnapshot().pending, null);
    assert.equal(session.getSnapshot().loadState, 'ready', 'An accepted exact receipt restores readiness');
    if (loadState === 'loading') {
      reloading.resolve(response(draft('superseded reload'), 40));
      assert.equal((await reload).status, 'ignored');
      assert.equal(session.current.current, newer);
      assert.equal(session.getSnapshot().revision, 3);
    }
    assert.deepEqual(calls.map(call => call.method), ['GET', 'PUT', ...(loadState === 'ready' ? [] : ['GET']), 'GET-check', 'GET-check']);
  }
});

test('prepare and accept exceptions return errors, preserve draft identity, and release locks', async () => {
  for (const stage of ['prepare', 'accept']) {
    const failure = new Error(`${stage} failed`);
    const { session, adapter, calls } = await ready({ adapter: { [stage]: () => { throw failure; } } });
    const original = session.current.current;
    assert.equal((await session.save()).error, failure);
    assert.equal(session.current.current, original);
    assert.equal(session.getSnapshot().saving, false);
    assert.equal(calls.filter(call => call.method === 'PUT').length, stage === 'prepare' ? 0 : 1);
    session.setAdapter({ ...adapter, prepare: value => value, accept: (submitted, current) => ({ draft: current, baseline: JSON.stringify(submitted), changedWhileSaving: false }) });
    assert.equal((await session.save()).status, 'saved');
  }
});

test('caller abort ignores both late success and rejection while releasing its own lock', async () => {
  for (const reject of [false, true]) {
    const read = deferred();
    const loaded = fixture({ read: () => read.promise });
    const controller = new AbortController(), original = loaded.session.current.current;
    const loading = loaded.session.reload(controller.signal);
    controller.abort();
    assert.equal(loaded.calls[0].signal.aborted, true);
    if (reject) read.reject(new DOMException('Aborted', 'AbortError'));
    else read.resolve(response());
    assert.equal((await loading).status, 'ignored');
    assert.equal(loaded.session.current.current, original);
    assert.equal(loaded.session.getSnapshot().loadState, 'loading', 'Cancellation must not publish a load error');
    const ack = deferred();
    const saving = await ready({ write: () => ack.promise });
    const cancel = new AbortController(), before = saving.session.current.current;
    const operation = saving.session.save({ signal: cancel.signal });
    cancel.abort();
    assert.equal(saving.calls[1].signal.aborted, true);
    if (reject) ack.reject(new DraftSaveUncertain(saving.calls[1].pending));
    else ack.resolve(receipt(saving.calls[1].pending.content));
    assert.equal((await operation).status, 'ignored');
    assert.equal(saving.session.current.current, before);
    assert.equal(saving.session.getSnapshot().saving, false);
    assert.equal(saving.session.getSnapshot().pending, null);
    assert.equal(saving.session.getSnapshot().conflict, false);
    assert.equal(saving.observed.length, 0, 'Cancelled acknowledgements must not reach accept');
    assert.equal(saving.calls.length, 2, 'Cancellation must not retry a write');
  }
  const preCancelled = await ready();
  const controller = new AbortController();
  controller.abort();
  const before = preCancelled.session.getSnapshot();
  assert.equal((await preCancelled.session.reload(controller.signal)).status, 'ignored');
  assert.equal((await preCancelled.session.save({ signal: controller.signal })).status, 'ignored');
  assert.equal(preCancelled.session.getSnapshot(), before);
  assert.equal(preCancelled.calls.length, 1);
});

test('deactivation aborts hydration and reactivation rejects old lifetime results', async () => {
  const hydrated = deferred(), entered = deferred();
  const { session, adapter, calls } = fixture({ adapter: { decodeLoad: async () => { entered.resolve(); return hydrated.promise; } } });
  const oldLife = session.lifetime.current, currentRef = session.current, lifeRef = session.lifetime;
  const oldLoad = session.reload();
  await entered.promise;
  session.deactivate();
  assert.equal(oldLife.signal.aborted, true);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal((await session.reload()).status, 'ignored');
  const inactiveDraft = session.current.current;
  let updaterCalled = false;
  session.setDraft(() => { updaterCalled = true; return draft('late callback'); });
  assert.equal(updaterCalled, false, 'Disposed sessions must not invoke draft updaters');
  assert.equal(session.current.current, inactiveDraft);
  session.activate();
  const reactivatedEdit = draft('reactivated edit');
  session.setDraft(reactivatedEdit);
  assert.equal(session.current.current, reactivatedEdit);
  assert.notEqual(session.lifetime.current, oldLife);
  assert.equal(session.current, currentRef);
  assert.equal(session.lifetime, lifeRef);
  session.setAdapter({ ...adapter, decodeLoad: body => ({ draft: body.content, baseline: '', revision: body.revision, updatedAt: null }) });
  assert.equal((await session.reload()).status, 'loaded');
  const accepted = session.current.current;
  hydrated.resolve({ draft: draft('old lifetime'), baseline: '', revision: 40, updatedAt: null });
  assert.equal((await oldLoad).status, 'ignored');
  assert.equal(session.current.current, accepted);
  assert.equal(session.getSnapshot().revision, 2);
});

test('an old save finally cannot release a newer session lock or publish uncertainty', async () => {
  const old = deferred(), fresh = deferred();
  let writes = 0;
  const { session, calls } = await ready({ write: () => ++writes === 1 ? old.promise : fresh.promise });
  const oldSave = session.save();
  const originalPending = calls[1].pending;
  session.deactivate();
  assert.equal(calls[1].signal.aborted, true);
  session.activate();
  assert.equal((await session.reload()).status, 'loaded');
  const newSave = session.save();
  old.reject(new DraftSaveUncertain(originalPending));
  assert.equal((await oldSave).status, 'ignored');
  assert.equal(session.getSnapshot().saving, true);
  assert.equal(session.getSnapshot().pending, null);
  assert.equal((await session.save()).status, 'ignored');
  fresh.resolve(receipt(calls.at(-1).pending.content));
  assert.equal((await newSave).status, 'saved');
  assert.equal(session.getSnapshot().saving, false);
});

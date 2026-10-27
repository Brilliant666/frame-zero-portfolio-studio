import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { waitForDraftResponse } from './manual-save-browser.mjs';

const source = await fs.readFile(new URL('../app/admin-kit/autosave-policy.ts', import.meta.url), 'utf8');
const { shouldAutosave } = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));

test('auto-save only runs for a changed, unblocked draft with the preference on', () => {
  const draft = {};
  const base = { enabled: true, dirty: true, blocked: false, version: draft, failedVersion: undefined };
  assert.equal(shouldAutosave(base), true);
  assert.equal(shouldAutosave({ ...base, enabled: false }), false, 'The per-browser switch turns it off');
  assert.equal(shouldAutosave({ ...base, dirty: false }), false, 'Nothing to save');
  assert.equal(shouldAutosave({ ...base, blocked: true }), false, 'Conflicts, pending confirmations, loading and open pickers block it');
});

test('a refused or failed save is not retried until the draft changes', () => {
  const failed = {};
  assert.equal(shouldAutosave({ enabled: true, dirty: true, blocked: false, version: failed, failedVersion: failed }), false);
  assert.equal(shouldAutosave({ enabled: true, dirty: true, blocked: false, version: {}, failedVersion: failed }), true, 'The next edit tries again');
});

test('editors wire auto-save through their own guarded save and expose the switch', async () => {
  const [hook, bar] = await Promise.all([
    fs.readFile(new URL('../app/admin-kit/autosave.ts', import.meta.url), 'utf8'),
    fs.readFile(new URL('../app/admin-kit/workbench.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(hook, /useSyncExternalStore\(subscribe, readPreference, \(\) => false\)/, 'Server render and hydration never schedule a save');
  assert.match(hook, /visibilitychange/, 'Leaving the tab saves immediately');
  assert.match(bar, /role="switch" aria-checked=\{enabled\} aria-label="自动保存草稿"/);
});

const draftPath = '/api/sites/anonymous/drafts/premium-polaroid';
const response = (method = 'PUT', path = draftPath, status = 200) => ({
  request: () => ({ method: () => method }),
  url: () => `http://127.0.0.1${path}`,
  status: () => status,
});

// A fast server responds during the click/fill, before that action's promise settles.
function responseDuringAction(responses) {
  let listener, completed = false, observedOptions;
  const missed = new Error('The action finished without an armed matching response listener');
  const page = {
    waitForResponse(predicate, options) {
      observedOptions = options;
      if (completed) return Promise.reject(missed);
      return new Promise((resolve, reject) => { listener = { predicate, resolve, reject, matched: false }; });
    },
  };
  const action = async () => {
    for (const value of responses) {
      if (listener && !listener.matched && listener.predicate(value)) {
        listener.matched = true; listener.resolve(value);
      }
    }
    completed = true;
    if (listener && !listener.matched) listener.reject(missed);
  };
  return { page, action, missed, options: () => observedOptions };
}

test('draft response waiting catches a successful response before the action resolves', async () => {
  const expected = response(), f = responseDuringAction([expected]);
  const actual = await waitForDraftResponse(f.page, draftPath, f.action);
  assert.equal(actual, expected);
  assert.equal(actual.status(), 200);
  assert.equal(f.options(), undefined, 'Manual save keeps the existing browser default timeout');
});

test('draft response waiting ignores other methods, sites and spaces', async () => {
  const expected = response(), f = responseDuringAction([
    response('GET'), response('POST'), response('PUT', '/api/sites/another/drafts/premium-polaroid'),
    response('PUT', '/api/sites/anonymous/drafts/basic'), expected,
  ]);
  const options = { timeout: 8000 };
  assert.equal(await waitForDraftResponse(f.page, draftPath, f.action, options), expected);
  assert.equal(f.options(), options, 'Auto-save keeps its existing eight-second bound');
});

test('draft response waiting rejects when only an unrelated response arrives', async () => {
  const f = responseDuringAction([response('GET'), response('PUT', '/api/sites/anonymous/drafts/basic')]);
  await assert.rejects(waitForDraftResponse(f.page, draftPath, f.action), error => error === f.missed);
});

test('draft response waiting exposes a rejected save status rather than treating it as success', async () => {
  const conflict = response('PUT', draftPath, 409), f = responseDuringAction([conflict]);
  assert.equal((await waitForDraftResponse(f.page, draftPath, f.action)).status(), 409);
});

test('draft response waiting propagates response timeouts and failed actions', async () => {
  const timeout = new Error('Response timeout'), failedAction = new Error('Button click failed');
  await assert.rejects(waitForDraftResponse({ waitForResponse: () => Promise.reject(timeout) }, draftPath, async () => {}), error => error === timeout);
  await assert.rejects(waitForDraftResponse({ waitForResponse: () => Promise.resolve(response()) }, draftPath, async () => { throw failedAction; }), error => error === failedAction);
  let rejectLateResponse;
  const pending = new Promise((_resolve, reject) => { rejectLateResponse = reject; });
  await assert.rejects(waitForDraftResponse({ waitForResponse: () => pending }, draftPath, () => { throw failedAction; }), error => error === failedAction);
  rejectLateResponse(timeout);
  await new Promise(resolve => setImmediate(resolve)); // A synchronous action failure must not orphan the waiter rejection.
});

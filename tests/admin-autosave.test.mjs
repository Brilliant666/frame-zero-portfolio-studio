import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

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

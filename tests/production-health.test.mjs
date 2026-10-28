import assert from 'node:assert/strict';
import { access, chmod, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkRuntimeReadiness } from '../db/accounts/health.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'production-health-'));
  t.after(async () => { await chmod(root, 0o700); await rm(root, { recursive: true, force: true }); });
  const queries = [];
  const runtime = { config: { mode: 'production', assetRoot: root }, pool: { async query(query) { queries.push(query); return { rows: [{ ready: true }] }; } } };
  return { root, runtime, queries };
}

test('readiness only reads required schema and directory permissions', async t => {
  const { runtime, queries } = await fixture(t);
  const permissions = [];
  const filesystem = { realpath, stat, async access(file, mode) { permissions.push(mode); await access(file, mode); } };
  assert.equal(await checkRuntimeReadiness(runtime, { filesystem }), true);
  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /^SELECT/);
  assert.match(queries[0].text, /site_publications/);
  assert.doesNotMatch(queries[0].text, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER)\b/);
  assert.equal(queries[0].query_timeout, 1000);
  assert.deepEqual(permissions, [constants.R_OK | constants.W_OK | constants.X_OK]);
});

test('missing schema, disconnected database and slow database are not ready', async t => {
  const { runtime } = await fixture(t);
  runtime.pool.query = async () => ({ rows: [{ ready: false }] });
  assert.equal(await checkRuntimeReadiness(runtime), false);
  runtime.pool.query = async () => { throw Error('private database address'); };
  assert.equal(await checkRuntimeReadiness(runtime), false);
  runtime.pool.query = () => new Promise(() => {});
  assert.equal(await checkRuntimeReadiness(runtime, { timeoutMs: 10 }), false);
});

test('missing, invalid, non-directory and inaccessible assets are not ready', async t => {
  const { root, runtime } = await fixture(t);
  runtime.config.assetRoot = path.join(root, 'missing');
  assert.equal(await checkRuntimeReadiness(runtime), false);
  runtime.config.assetRoot = 'relative-private-path';
  assert.equal(await checkRuntimeReadiness(runtime), false);
  const file = path.join(root, 'file'); await writeFile(file, 'fixture');
  runtime.config.assetRoot = file;
  assert.equal(await checkRuntimeReadiness(runtime), false);
  runtime.config.assetRoot = root;
  assert.equal(await checkRuntimeReadiness(runtime, { filesystem: { realpath, stat, async access() { throw Error('private permission path'); } } }), false);
  assert.equal(await checkRuntimeReadiness(runtime, { timeoutMs: 10, filesystem: { realpath: () => new Promise(() => {}), stat, access } }), false);
});

test('Linux non-root directory permission loss is visible without a write probe', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async t => {
  const { root, runtime } = await fixture(t);
  await chmod(root, 0o500);
  assert.equal(await checkRuntimeReadiness(runtime), false);
  await chmod(root, 0o700);
  assert.equal(await checkRuntimeReadiness(runtime), true);
});

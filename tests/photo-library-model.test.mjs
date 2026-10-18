import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function load(file) {
  const source = await fs.readFile(new URL(`../app/admin-kit/${file}`, import.meta.url), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
}
const model = await load('photo-library-model.ts');
const upload = await load('library-upload.ts');

const at = minutes => new Date(Date.UTC(2026, 9, 1) + minutes * 60_000).toISOString();
const photo = (id, minutes, orientation = 'portrait') => ({ id, orientation, ...(minutes === null ? {} : { createdAt: at(minutes) }) });
const view = (change = {}) => ({ ...model.DEFAULT_LIBRARY_VIEW, ...change });

test('upload batches follow sittings: requests minutes apart stay together, a long pause starts a new batch', () => {
  const assets = [photo('c', 200), photo('a', 0), photo('b', 25), photo('d', 231), photo('x', null), photo('e', 29 + 25)];
  const batches = model.groupUploadBatches(assets);
  assert.deepEqual(batches.map(batch => batch.items.map(item => item.id)), [['a', 'b', 'e'], ['c'], ['d'], ['x']]);
  assert.equal(batches[0].start, at(0)); assert.equal(batches[0].end, at(54));
  assert.equal(batches.at(-1).key, 'batch-unknown', 'Photos without a time are one last batch');
  assert.deepEqual(model.groupUploadBatches([photo('p', 0), photo('o', 0)])[0].items.map(item => item.id), ['o', 'p'], 'Same time: stable id order');
});

test('sections: newest first by default, unknown times last, and membership scopes count every album of the space', () => {
  const assets = [photo('a', 0), photo('b', 1, 'landscape'), photo('c', 100), photo('d', 101), photo('x', null)];
  const albums = [{ id: 'one', name: 'One', assetIds: ['d', 'a'], visible: true }, { id: 'two', name: 'Two', assetIds: ['a'], visible: false }];
  const ids = sections => sections.map(section => section.items.map(item => item.id));
  assert.deepEqual(ids(model.librarySections(assets, albums, view())), [['d', 'c'], ['b', 'a'], ['x']]);
  assert.deepEqual(ids(model.librarySections(assets, albums, view({ sort: 'oldest' }))), [['a', 'b'], ['c', 'd'], ['x']]);
  assert.deepEqual(ids(model.librarySections(assets, albums, view({ scope: 'unfiled' }))), [['c'], ['b'], ['x']]);
  assert.deepEqual(ids(model.librarySections(assets, albums, view({ scope: 'filed' }))), [['d'], ['a']]);
  assert.deepEqual(ids(model.librarySections(assets, albums, view({ orientation: 'landscape' }))), [['b']]);
  assert.deepEqual(ids(model.librarySections(assets, albums, view({ grouped: false }))), [['d', 'c', 'b', 'a', 'x']]);
  assert.deepEqual(ids(model.librarySections(assets, albums, view({ scope: 'album:one' }))), [['d', 'a']], 'An album lists members in its own order');
  assert.deepEqual(ids(model.librarySections(assets, albums, view({ scope: 'album:gone' }))), [[]]);
  assert.deepEqual(ids(model.librarySections(assets, albums, view({ query: 'X' }))), [['x']], 'Asset ID lookup is case-insensitive');
  assert.deepEqual([...model.membershipIndex(albums).get('a')].map(album => album.id), ['one', 'two']);
});

test('selection keeps pick order; ranges follow display order in either direction and skip unselectable photos', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(model.toggleSelection(['c'], 'a'), ['c', 'a']);
  assert.deepEqual(model.toggleSelection(['c', 'a'], 'c'), ['a']);
  assert.deepEqual(model.toggleSelection([], 'b', id => id !== 'b'), []);
  assert.deepEqual(model.selectRange(order, ['b'], 'b', 'd'), ['b', 'c', 'd']);
  assert.deepEqual(model.selectRange(order, ['d'], 'd', 'b'), ['d', 'c', 'b'], 'Upward ranges append nearest-first');
  assert.deepEqual(model.selectRange(order, ['a'], 'a', 'e', id => id !== 'c'), ['a', 'b', 'd', 'e']);
  assert.deepEqual(model.selectRange(order, [], null, 'c'), ['c'], 'No anchor: a plain pick');
  assert.deepEqual(model.setSelection(['e'], ['a', 'e', 'b'], true), ['e', 'a', 'b']);
  assert.deepEqual(model.setSelection(['e', 'a', 'b'], ['a', 'b'], false), ['e']);
  assert.equal(model.batchState(['a', 'b'], new Set(['a'])), 'some');
  assert.equal(model.batchState(['a', 'b'], new Set(['a', 'b', 'z'])), 'all');
  assert.equal(model.batchState(['a', 'b'], new Set()), 'none');
});

test('adding reports only new members; undoing a removal restores old positions and keeps later additions', () => {
  assert.deepEqual(model.additionsFor({ assetIds: ['a', 'b'] }, ['b', 'c', 'c', 'd']), ['c', 'd']);
  assert.deepEqual(model.restoreMembers(['a', 'b', 'c', 'd'], ['a', 'd', 'z'], ['b', 'c']), ['a', 'b', 'c', 'd', 'z']);
  assert.deepEqual(model.restoreMembers(['a', 'b', 'c'], ['c'], ['b']), ['b', 'c'], 'Members removed elsewhere since stay removed');
});

test('upload queue checks each file and reports ids, duplicates, retries while busy, and uncertain results', async () => {
  assert.equal(upload.uploadProblem({ name: 'a.gif', size: 1, type: 'image/gif' }), '只支持 JPEG、PNG 或 WebP');
  assert.equal(upload.uploadProblem({ name: 'a.jpg', size: 20 * 1024 * 1024 + 1, type: 'image/jpeg' }), '超过 20 MB');
  assert.equal(upload.uploadProblem({ name: 'a.jpg', size: 10, type: 'image/jpeg' }), null);
  const file = Object.assign(new Blob(['x'], { type: 'image/jpeg' }), { name: '照片 1.jpg' });
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  const calls = [];
  const pauses = [];
  const sequence = [reply(429, {}), reply(429, {}), reply(201, { asset: { id: 'new-id' }, deduplicated: false })];
  const result = await upload.uploadLibraryFile('/api/sites/x/assets', file, async (url, init) => { calls.push([url, init.headers['X-File-Name']]); return sequence.shift(); }, ms => { pauses.push(ms); });
  assert.deepEqual(result, { status: 'uploaded', id: 'new-id' });
  assert.deepEqual(pauses, [1200, 2400]);
  assert.equal(calls[0][1], encodeURIComponent('照片 1.jpg'));
  assert.deepEqual(await upload.uploadLibraryFile('/e', file, async () => reply(200, { asset: { id: 'old' }, deduplicated: true })), { status: 'duplicate', id: 'old' });
  assert.equal((await upload.uploadLibraryFile('/e', file, async () => reply(413, {}))).status, 'rejected');
  assert.equal((await upload.uploadLibraryFile('/e', file, async () => reply(503, {}))).status, 'uncertain');
  assert.equal((await upload.uploadLibraryFile('/e', file, async () => { throw new Error('lost'); })).status, 'uncertain');
  assert.equal((await upload.uploadLibraryFile('/e', file, async () => reply(201, { nope: true }))).status, 'uncertain');
  let busy = 0;
  assert.equal((await upload.uploadLibraryFile('/e', file, async () => { busy++; return reply(429, {}); }, () => {})).status, 'rejected', 'Gives up after three retries');
  assert.equal(busy, 4);
});

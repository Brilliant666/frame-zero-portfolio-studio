import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function modules(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'site-draft-save-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, location] of [['catalog', 'templates/catalog'], ['document', 'preview-workspace/document'], ['schema', 'site-editor/content-schema'], ['save', 'site-editor/draft-save']]) {
    const source = await fs.readFile(new URL(`../app/${location}.ts`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace('"../site-config"', '"./catalog.mjs"').replace('"../preview-workspace/document"', '"./document.mjs"').replace('"./content-schema"', '"./schema.mjs"');
    await fs.writeFile(path.join(directory, `${name}.mjs`), js);
  }
  return { ...await import(pathToFileURL(path.join(directory, 'save.mjs'))), ...await import(pathToFileURL(path.join(directory, 'schema.mjs'))), ...await import(pathToFileURL(path.join(directory, 'document.mjs'))) };
}
const endpoint = '/api/sites/anonymous-fixture/drafts/basic';
const envelope = (content, revision = 3) => ({ content, revision, updatedAt: '2026-09-28T00:00:00.000Z' });

test('save confirmation binds exact revision and normalized submitted content in both spaces', async t => {
  const m = await modules(t);
  for (const [space, content] of [['basic', m.createEmptyBasicContent()], ['premium-polaroid', m.createEmptyPreviewDocument()]]) {
    const pending = { content, expectedRevision: 2 };
    assert.equal(m.matchesDraftSave(envelope(content), pending, space), true);
    assert.equal(m.matchesDraftSave(envelope(content, 4), pending, space), false, 'Must not adopt a newer tab revision');
    const other = structuredClone(content); other.profile.photographer = 'Other tab';
    assert.equal(m.matchesDraftSave(envelope(other), pending, space), false);
  }
  const content = m.createEmptyBasicContent();
  content.works = [{ assetId: 'abcdef00-0000-4000-8000-000000000001', code: '', title: '', subtitle: '', position: 'center', previewWidth: 900, previewHeight: 600, fullWidth: 900, enabled: true, image: '/api/sites/anonymous-fixture/assets/abcdef00-0000-4000-8000-000000000001/full', preview: '/api/sites/anonymous-fixture/assets/abcdef00-0000-4000-8000-000000000001/card' }];
  const normalized = m.parseSpaceContent('basic', content);
  assert.equal(normalized.works[0].image, '');
  assert.equal(m.matchesDraftSave(envelope(normalized), { content, expectedRevision: 2 }, 'basic'), true, 'Hydrated URLs must not prevent a precise normalized confirmation');
  assert.throws(() => m.readSaveReceipt({ revision: '3', content: {}, updatedAt: null }, 'basic'));
});

test('lost successful response only reads once and returns the precise original receipt', async t => {
  const m = await modules(t), content = m.createEmptyBasicContent(), calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(init.method ?? 'GET');
    if (init.method === 'PUT') throw new TypeError('Connection lost after commit');
    return Response.json(envelope(content));
  });
  const result = await m.writeSiteDraft(endpoint, 'basic', { content, expectedRevision: 2 });
  assert.equal(result.revision, 3); assert.equal(result.confirmedAfterLoss, true);
  assert.deepEqual(calls, ['PUT', 'GET']);
});

test('failed or superseded writes remain pending without replaying PUT', async t => {
  const m = await modules(t), content = m.createEmptyBasicContent();
  for (const [name, read] of [['not committed', envelope(content, 2)], ['newer version', envelope(content, 4)], ['different content', envelope({ ...content, profile: { ...content.profile, photographer: 'Other tab' } })]]) {
    const calls = [];
    const mock = t.mock.method(globalThis, 'fetch', async (_url, init) => {
      calls.push(init.method ?? 'GET');
      if (init.method === 'PUT') throw new TypeError('Connection lost');
      return Response.json(read);
    });
    await assert.rejects(m.writeSiteDraft(endpoint, 'basic', { content, expectedRevision: 2 }), m.DraftSaveUncertain, name);
    assert.deepEqual(calls, ['PUT', 'GET']); mock.mock.restore();
  }
});

test('a definite CAS refusal never reads or publishes a different saved version', async t => {
  const m = await modules(t), calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => { calls.push(init.method); return new Response(null, { status: 409 }); });
  await assert.rejects(m.writeSiteDraft(endpoint, 'basic', { content: m.createEmptyBasicContent(), expectedRevision: 2 }), error => error instanceof m.DraftSaveRejected && error.status === 409);
  assert.deepEqual(calls, ['PUT']);
});

test('unmount cancellation does not trigger recovery into the next context', async t => {
  const m = await modules(t), controller = new AbortController(), calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => { calls.push(init.method); controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(m.writeSiteDraft(endpoint, 'basic', { content: m.createEmptyBasicContent(), expectedRevision: 2 }, controller.signal));
  assert.deepEqual(calls, ['PUT']);
});

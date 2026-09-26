import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function schema(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'site-editor-schema-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, sourcePath] of [['catalog', 'templates/catalog'], ['document', 'preview-workspace/document'], ['schema', 'site-editor/content-schema']]) {
    const source = await fs.readFile(new URL(`../app/${sourcePath}.ts`, import.meta.url), 'utf8');
    // site-config reexports these exact catalog functions. Avoid loading its
    // unrelated legacy photo defaults in this pure schema unit test.
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace('"../site-config"', '"./catalog.mjs"').replace('"../preview-workspace/document"', '"./document.mjs"');
    await fs.writeFile(path.join(directory, `${name}.mjs`), js);
  }
  return { ...await import(pathToFileURL(path.join(directory, 'schema.mjs'))), ...await import(pathToFileURL(path.join(directory, 'document.mjs'))) };
}

test('Site spaces have empty independent defaults and lossless separate schemas', async t => {
  const m = await schema(t);
  const basic = m.createEmptyBasicContent(), premium = m.createEmptyPreviewDocument();
  assert.deepEqual(m.parseSpaceContent('basic', basic), basic);
  assert.deepEqual(m.parseSpaceContent('premium-polaroid', premium), premium);
  assert.equal(basic.profile.photographer, '');
  assert.equal(premium.contact.email, '');
  assert.equal(Object.keys(basic.templateWorks).length, 11);
  assert.deepEqual(Object.keys(basic).sort(), ['activeTemplate', 'bookingFields', 'contact', 'hero', 'packages', 'profile', 'social', 'statement', 'templateWorks', 'trustItems', 'works'].sort());
  for (const key of Object.keys(basic)) {
    const incomplete = structuredClone(basic); delete incomplete[key];
    assert.throws(() => m.parseSpaceContent('basic', incomplete), `Basic requires its own ${key} field`);
  }
  for (const extra of ['schemaVersion', 'collections', 'futurePremiumSetting']) {
    assert.throws(() => m.parseSpaceContent('basic', { ...basic, [extra]: null }));
  }
  basic.profile.photographer = 'Independent basic';
  basic.packages = [{ number: '01', english: 'Basic', name: 'Basic package', description: '', price: '100', duration: '', deliverables: [], enabled: true }];
  assert.equal(premium.profile.photographer, '');
  assert.deepEqual(premium.packages, []);
  assert.deepEqual(m.parseSpaceContent('basic', basic), basic);
  assert.throws(() => m.parseSpaceContent('basic', premium));
  assert.throws(() => m.parseSpaceContent('premium-polaroid', basic));
});

test('Site schemas reject unknown fields, malformed fields and unsupported template identifiers', async t => {
  const m = await schema(t);
  for (const space of ['basic', 'premium-polaroid']) {
    const original = space === 'basic' ? m.createEmptyBasicContent() : m.createEmptyPreviewDocument();
    for (const change of [
      d => d.siteId = 'forged', d => d.profile.owner = 'forged', d => delete d.contact.email,
      d => d.packages = [{ name: 'incomplete' }], d => d.hero.title = 'x'.repeat(2001),
      d => d.social = [{ label: 'platform', handle: 'fixture', unknown: true }],
    ]) {
      const copy = structuredClone(original); change(copy);
      assert.throws(() => m.parseSpaceContent(space, copy));
    }
  }
  for (const change of [d => d.activeTemplate = 'premium-polaroid', d => d.templateWorks = { unknown: [] }, d => d.templateWorks = [], d => d.works = {}, d => d.collections = []]) {
    const copy = m.createEmptyBasicContent(); change(copy);
    assert.throws(() => m.parseSpaceContent('basic', copy));
  }
});

test('all persisted asset channels are rejected until Site-scoped M3 ownership is connected', async t => {
  const m = await schema(t);
  for (const change of [d => d.works.push({ assetId: 'global-photo' }), d => d.templateWorks['cinematic-light'].push({ image: '/photos/global.webp' }), d => d.social.push({ label: 'card', handle: '', qrAssetId: 'a'.repeat(64) })]) {
    const copy = m.createEmptyBasicContent(); change(copy);
    assert.throws(() => m.parseSpaceContent('basic', copy), m.UnconnectedAssetError);
  }
  const emptyCollection = { id: '11111111-1111-4111-8111-111111111111', name: 'Empty own collection', description: '', visible: true, coverAssetId: null, coverFit: 'natural', coverFocusX: 50, coverFocusY: 50, assetIds: [], focusAssetId: null };
  const premium = m.createEmptyPreviewDocument(); premium.collections = [emptyCollection];
  assert.deepEqual(m.parseSpaceContent('premium-polaroid', premium), premium);
  for (const change of [d => d.collections[0].assetIds.push('global-photo'), d => d.collections[0].coverAssetId = 'global-photo', d => { d.collections[0].assetIds = ['global-photo']; d.collections[0].focusAssetId = 'global-photo'; }, d => d.social.push({ label: 'card', handle: '', qrAssetId: 'b'.repeat(64) })]) {
    const copy = structuredClone(premium); change(copy);
    assert.throws(() => m.parseSpaceContent('premium-polaroid', copy), m.UnconnectedAssetError);
  }
});

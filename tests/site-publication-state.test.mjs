import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(await fs.readFile(new URL('../app/site-editor/publication-state.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { publicationMatches, publicationSynced } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const current = { id: 'old-publication', space: 'basic', templateId: 'cinematic-light', draftRevision: 2, publishedAt: '2026-09-28T00:00:00Z' };
const pending = { space: 'basic', templateId: 'cinematic-light', revision: 2, expectedPublicationId: current.id };

test('same version still at original pointer does not confirm a lost republish', () => {
  assert.equal(publicationMatches(current, pending), false);
  assert.equal(publicationMatches({ ...current, id: 'new-publication' }, pending), true);
  assert.equal(publicationMatches(null, pending), false);
  assert.equal(publicationMatches({ ...current, id: 'other', draftRevision: 3 }, pending), false);
});
test('equal revision numbers in different spaces or templates never count as synchronized', () => {
  assert.equal(publicationSynced(current, 'basic', 'cinematic-light', 2, false), true);
  assert.equal(publicationSynced(current, 'premium-polaroid', 'premium-polaroid', 2, false), false);
  assert.equal(publicationSynced(current, 'basic', 'film-rail', 2, false), false);
  assert.equal(publicationSynced(current, 'basic', 'cinematic-light', 2, true), false);
  assert.equal(publicationMatches({ ...current, id: 'other', space: 'premium-polaroid', templateId: 'premium-polaroid' }, pending), false);
});
test('rollback confirmation binds the exact selected immutable history record', () => {
  assert.equal(publicationMatches(current, { ...pending, rollbackId: current.id }), true);
  assert.equal(publicationMatches({ ...current, id: 'other' }, { ...pending, rollbackId: current.id }), false);
  assert.equal(publicationMatches({ ...current, space: 'premium-polaroid' }, { ...pending, rollbackId: current.id }), false);
  assert.equal(publicationMatches({ ...current, templateId: 'film-rail' }, { ...pending, rollbackId: current.id }), false);
});

test('server content match confirms a deduplicated request at the same pointer despite newer draft revision', () => {
  const matched = { ...current, matchedDraftRevision: 7 };
  assert.equal(publicationMatches(matched, { ...pending, revision: 7 }), true);
  assert.equal(publicationSynced(matched, 'basic', 'cinematic-light', 7, false), true);
  assert.equal(publicationSynced(matched, 'basic', 'cinematic-light', 7, true), false);
  assert.equal(publicationMatches(matched, { ...pending, revision: 2 }), false);
  assert.equal(publicationMatches(matched, { ...pending, revision: 7, templateId: 'film-rail' }), false);
  assert.equal(publicationMatches(matched, { ...pending, revision: 7, space: 'premium-polaroid' }), false);
});

test('explicit non-match is authoritative for synchronization and unchanged-pointer confirmation', () => {
  const unmatched = { ...current, id: 'new', matchedDraftRevision: null };
  assert.equal(publicationMatches({ ...unmatched, id: current.id }, pending), false);
  assert.equal(publicationSynced(unmatched, 'basic', 'cinematic-light', 2, false), false);
  assert.equal(publicationSynced({ ...unmatched, matchedDraftRevision: 3 }, 'basic', 'cinematic-light', 2, false), false);
});

test('new immutable snapshot confirms its captured revision when a later draft changes the live match', () => {
  const published = { ...current, id: 'created', matchedDraftRevision: null };
  assert.equal(publicationMatches(published, pending), true);
  assert.equal(publicationSynced(published, 'basic', 'cinematic-light', 3, false), false);
  assert.equal(publicationMatches({ ...published, draftRevision: 1 }, pending), false, 'older reused snapshot without current content proof remains pending');
});

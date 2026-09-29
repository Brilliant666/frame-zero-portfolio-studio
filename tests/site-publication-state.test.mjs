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
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { legacyImportSourceGate, assertLegacyOperatorApplyAllowed } from '../scripts/lib/legacy-import-source-gate.mjs';

test('real operator rejects derivative-only or missing-original plans without an override', () => {
  for (const asset of [
    { provenance: 'legacy-derived-only', variants: { full: {} }, sourceVariants: { full: {} } },
    { provenance: 'legacy-derived-only', variants: { original: {} }, sourceVariants: { original: {} } },
    { provenance: 'original', variants: { full: {} }, sourceVariants: { original: {} } },
    { provenance: 'original', variants: { original: {} }, sourceVariants: { full: {} } },
  ]) {
    const gate = legacyImportSourceGate({ assets: [asset] });
    assert.equal(gate.complete, false);
    assert.equal(gate.originalSourceStatus, 'UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST');
    assert.deepEqual(gate.unresolved, ['UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST']);
    assert.throws(() => assertLegacyOperatorApplyAllowed(gate), /PARTIAL_SOURCE_APPLY_BLOCKED/);
  }
});

test('complete mappings pass this gate but still require the existing preflight', () => {
  const gate = legacyImportSourceGate({ assets: [{ provenance: 'original', variants: { original: {} }, sourceVariants: { original: {} } }] });
  assert.equal(gate.complete, true);
  assert.deepEqual(gate.unresolved, []);
  assert.doesNotThrow(() => assertLegacyOperatorApplyAllowed(gate));
});

test('display acceptance permits verified derivative provenance without pretending originals exist', () => {
  const variants = { thumbnail: {}, card: {}, full: {} };
  const plan = { assets: [{ provenance: 'legacy-derived-only', variants, sourceVariants: structuredClone(variants) }] };
  const gate = legacyImportSourceGate(plan, 'display-acceptance');
  assert.equal(gate.complete, false); assert.equal(gate.displayReady, true);
  assert.equal(gate.originalArchive, 'INCOMPLETE');
  assert.equal(gate.originalSourceStatus, 'UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST');
  assert.doesNotThrow(() => assertLegacyOperatorApplyAllowed(gate));
  assert.throws(() => assertLegacyOperatorApplyAllowed(legacyImportSourceGate(plan)), /PARTIAL_SOURCE_APPLY_BLOCKED/);
  assert.equal(plan.assets[0].variants.original, undefined);
  for (const mutate of [
    p => { delete p.assets[0].variants.card; },
    p => { delete p.assets[0].sourceVariants.full; },
    p => { p.assets[0].provenance = 'original'; },
    p => { p.assets[0].variants.original = {}; },
    p => { p.assets[0].variants.original = {}; p.assets[0].sourceVariants.original = {}; },
  ]) {
    const invalid = structuredClone(plan); mutate(invalid);
    assert.throws(() => assertLegacyOperatorApplyAllowed(legacyImportSourceGate(invalid, 'display-acceptance')), /DISPLAY_SOURCE_APPLY_BLOCKED/);
  }
  assert.throws(() => legacyImportSourceGate(plan, 'force'), /INVALID_IMPORT_MODE/);
});

test('operator reports partial source and gates apply before invoking the writer', async () => {
  const source = await readFile(new URL('../scripts/site-legacy-import.mjs', import.meta.url), 'utf8');
  assert.match(source, /sourceGate\.complete \? 'DRY_RUN_VERIFIED' : 'PARTIAL_SOURCE'/);
  const gate = source.indexOf('assertLegacyOperatorApplyAllowed(sourceGate)');
  assert.ok(gate > 0 && gate < source.indexOf('await applyLegacyImport('));
  assert.match(source, /unresolved: \[.*sourceGate\.unresolved/);
  assert.match(source, /legacyImportSourceGate\(plan, mode\)/);
  assert.ok(source.indexOf('await preflightLegacyImport(') < gate);
  assert.ok(source.indexOf('await verifyLegacySourceUnchanged(') < source.indexOf('await applyLegacyImport('));
});

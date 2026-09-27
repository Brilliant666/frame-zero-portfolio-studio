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

test('operator reports partial source and gates apply before invoking the writer', async () => {
  const source = await readFile(new URL('../scripts/site-legacy-import.mjs', import.meta.url), 'utf8');
  assert.match(source, /sourceGate\.complete \? 'DRY_RUN_VERIFIED' : 'PARTIAL_SOURCE'/);
  const gate = source.indexOf('assertLegacyOperatorApplyAllowed(sourceGate)');
  assert.ok(gate > 0 && gate < source.indexOf('await applyLegacyImport('));
  assert.match(source, /unresolved: \[.*sourceGate\.unresolved/);
});

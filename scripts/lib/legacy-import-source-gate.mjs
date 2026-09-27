// Real operator safety gate. Fixture-level derivative copying is not evidence
// that every original belonging to the photographer has been mapped.
export function legacyImportSourceGate(plan) {
  const incomplete = plan.assets.some(asset => asset.provenance === 'legacy-derived-only' || !asset.sourceVariants?.original || !asset.variants?.original);
  return {
    complete: !incomplete,
    originalSourceStatus: incomplete ? 'UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST' : 'ORIGINALS_MAPPED_IN_PLAN',
    unresolved: incomplete ? ['UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST'] : [],
  };
}

export function assertLegacyOperatorApplyAllowed(sourceGate) {
  if (!sourceGate.complete || sourceGate.unresolved.length) throw new Error('PARTIAL_SOURCE_APPLY_BLOCKED');
}

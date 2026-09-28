// Real operator safety gate. Fixture-level derivative copying is not evidence
// that every original belonging to the photographer has been mapped.
export function legacyImportSourceGate(plan, mode = 'complete') {
  if (!['complete', 'display-acceptance'].includes(mode)) throw new Error('INVALID_IMPORT_MODE');
  const incomplete = plan.assets.some(asset => asset.provenance === 'legacy-derived-only' || !asset.sourceVariants?.original || !asset.variants?.original);
  const displayReady = plan.assets.every(asset => {
    if (!['thumbnail', 'card', 'full'].every(name => asset.variants?.[name] && asset.sourceVariants?.[name])) return false;
    const original = Boolean(asset.variants?.original), sourceOriginal = Boolean(asset.sourceVariants?.original);
    if (original !== sourceOriginal) return false;
    // Missing originals are a specific provenance, not a generic error override.
    return original ? asset.provenance !== 'legacy-derived-only' : asset.provenance === 'legacy-derived-only';
  });
  return {
    mode,
    complete: !incomplete,
    displayReady,
    originalArchive: incomplete ? 'INCOMPLETE' : 'COMPLETE',
    originalSourceStatus: incomplete ? 'UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST' : 'ORIGINALS_MAPPED_IN_PLAN',
    unresolved: incomplete ? ['UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST'] : [],
  };
}

export function assertLegacyOperatorApplyAllowed(sourceGate) {
  if (sourceGate.mode === 'display-acceptance') {
    if (!sourceGate.displayReady || sourceGate.unresolved.some(code => code !== 'UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST')) throw new Error('DISPLAY_SOURCE_APPLY_BLOCKED');
    return;
  }
  if (!sourceGate.complete || sourceGate.unresolved.length) throw new Error('PARTIAL_SOURCE_APPLY_BLOCKED');
}

/** Resolve browsing focus without promoting a fallback into a saved preference. */
export function resolveComposerHero(
  availableIds: readonly string[],
  preferredId?: string | null,
  focusId?: string | null,
  coverId?: string | null,
): { id: string | null; source: "preference" | "focus" | "cover" | "first" | "empty" } {
  const available = new Set(availableIds);
  if (preferredId && available.has(preferredId)) return { id: preferredId, source: "preference" };
  if (coverId && available.has(coverId)) return { id: coverId, source: "cover" };
  if (focusId && available.has(focusId)) return { id: focusId, source: "focus" };
  return availableIds.length ? { id: availableIds[0], source: "first" } : { id: null, source: "empty" };
}

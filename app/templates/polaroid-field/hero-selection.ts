import type { PhotoSlot } from "../shared/photo-slots";

export const POLAROID_HERO_SLOT_PRIORITY = Object.freeze([4, 8, 0, 2, 7, 6, 1, 3, 5]);
export const POLAROID_HERO_SUPPORT_COUNT = 3;

export type PolaroidHeroSelection = Readonly<{
  heroSlot: PhotoSlot | null;
  supportSlots: readonly PhotoSlot[];
}>;

/**
 * Keeps the existing centre-card intent as the cover, while falling back to
 * the first populated slot in a stable editorial order. Empty slots only fill
 * the preview fragments after all available photographs have been considered.
 */
export function selectPolaroidHero(slots: readonly PhotoSlot[]): PolaroidHeroSelection {
  const orderedSlots = POLAROID_HERO_SLOT_PRIORITY
    .map((slotIndex) => slots[slotIndex])
    .filter((slot): slot is PhotoSlot => slot !== undefined);
  const populatedSlots = orderedSlots.filter((slot) => slot.work !== null);
  const heroSlot = populatedSlots[0] ?? orderedSlots[0] ?? null;

  if (!heroSlot) return { heroSlot: null, supportSlots: [] };

  const supportSlots = [...populatedSlots, ...orderedSlots]
    .filter((slot, index, candidates) => (
      slot.index !== heroSlot.index
      && candidates.findIndex((candidate) => candidate.index === slot.index) === index
    ))
    .slice(0, POLAROID_HERO_SUPPORT_COUNT);

  return { heroSlot, supportSlots };
}

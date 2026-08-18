export const CINEMATIC_LIGHT_SLOT_COUNT = 9;
export const CINEMATIC_LIGHT_HERO_SLOT_INDEX = 0;
export const CINEMATIC_LIGHT_STATEMENT_SLOT_INDEX = 8;

// Slots 0 and 8 retain their original structural meaning. The seven archive
// slots stay mutually exclusive with both structural surfaces, so the frozen
// nine-slot V1 contract never renders one asset as two non-interactive images.
export const CINEMATIC_LIGHT_ARCHIVE_SLOT_INDEXES = Object.freeze([
  1, 2, 3, 4, 5, 6, 7,
] as const);

export function splitCinematicLightSlots<T>(slots: readonly T[]) {
  if (slots.length !== CINEMATIC_LIGHT_SLOT_COUNT) {
    throw new RangeError(`Cinematic Light requires ${CINEMATIC_LIGHT_SLOT_COUNT} stable slots.`);
  }

  return Object.freeze({
    hero: slots[CINEMATIC_LIGHT_HERO_SLOT_INDEX],
    archive: Object.freeze(CINEMATIC_LIGHT_ARCHIVE_SLOT_INDEXES.map((slotIndex) => slots[slotIndex])),
    statement: slots[CINEMATIC_LIGHT_STATEMENT_SLOT_INDEX],
  });
}

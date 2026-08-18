export const FILM_RAIL_SLOT_COUNT = 9;
export const FILM_RAIL_HERO_SLOT_INDEX = 0;
export const FILM_RAIL_FRAME_SLOT_INDEXES = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8,
] as const);

export function splitFilmRailSlots<T>(slots: readonly T[]) {
  if (slots.length !== FILM_RAIL_SLOT_COUNT) {
    throw new RangeError(`Film Rail requires ${FILM_RAIL_SLOT_COUNT} stable slots.`);
  }

  return Object.freeze({
    hero: slots[FILM_RAIL_HERO_SLOT_INDEX],
    frames: Object.freeze(FILM_RAIL_FRAME_SLOT_INDEXES.map((slotIndex) => slots[slotIndex])),
  });
}

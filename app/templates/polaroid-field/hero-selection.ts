import type { PhotoSlot } from "../shared/photo-slots";

// Slot 05 is the authored centre of the constellation, not an editorial pick.
const FOCUS_FALLBACK_ORDER = [4, 8, 0, 2, 7, 6, 1, 3, 5] as const;

export function selectPolaroidFocus(slots: readonly PhotoSlot[]) {
  const focusSlot = FOCUS_FALLBACK_ORDER
    .map((index) => slots[index])
    .find((slot) => slot?.work) ?? slots[4] ?? slots[0] ?? null;
  return { focusSlot };
}

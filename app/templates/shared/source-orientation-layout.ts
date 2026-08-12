import {
  intrinsicPhotoOrientation,
  normalizePrimaryAssignmentRatio,
  photoRatioNumber,
  primaryPhotoRatioForDimensions,
  type IntrinsicPhotoOrientation,
  type PrimaryPhotoRatio,
} from "../../photo-ratio-policy";
import type { PhotoRatio } from "../catalog";

export type SourceOrientationWork = Readonly<{
  previewWidth: number;
  previewHeight: number;
  slotIndex?: unknown;
}>;

export type SourceOrientationSlot<Work extends SourceOrientationWork> = {
  index: number;
  ratio: PrimaryPhotoRatio;
  sourceOrientation: IntrinsicPhotoOrientation | null;
  work: Work | null;
};

function fixedSlotIndex(work: SourceOrientationWork, slotCount: number) {
  return typeof work.slotIndex === "number"
    && Number.isInteger(work.slotIndex)
    && work.slotIndex >= 0
    && work.slotIndex < slotCount
    ? work.slotIndex
    : null;
}

function placeWork<Work extends SourceOrientationWork>(
  slot: SourceOrientationSlot<Work>,
  work: Work,
) {
  const orientation = intrinsicPhotoOrientation(work.previewWidth, work.previewHeight);
  if (!orientation) return false;
  slot.work = work;
  slot.sourceOrientation = orientation;
  slot.ratio = primaryPhotoRatioForDimensions(work.previewWidth, work.previewHeight)!;
  return true;
}

/** Keeps stable slot identities while deriving only the 3:2 / 2:3 presentation. */
export function buildSourceOrientationSlots<Work extends SourceOrientationWork>(
  works: readonly Work[],
  fallbackRatios: readonly PhotoRatio[],
): SourceOrientationSlot<Work>[] {
  const slots = fallbackRatios.map((ratio, index): SourceOrientationSlot<Work> => ({
    index,
    ratio: normalizePrimaryAssignmentRatio(ratio),
    sourceOrientation: null,
    work: null,
  }));
  const fixedWorkIndexes = new Set<number>();

  works.forEach((work, workIndex) => {
    const slotIndex = fixedSlotIndex(work, slots.length);
    if (slotIndex === null) return;
    fixedWorkIndexes.add(workIndex);
    if (!slots[slotIndex].work) placeWork(slots[slotIndex], work);
  });

  const openSlots = slots.filter((slot) => !slot.work);
  let openSlotIndex = 0;
  for (const [workIndex, work] of works.entries()) {
    if (fixedWorkIndexes.has(workIndex)) continue;
    if (openSlotIndex >= openSlots.length) break;
    if (placeWork(openSlots[openSlotIndex], work)) openSlotIndex += 1;
  }
  return slots;
}

export function groupSourceOrientationSlots<Slot>(slots: readonly Slot[], rowSize = 3) {
  if (!Number.isSafeInteger(rowSize) || rowSize <= 0) throw new RangeError("rowSize must be positive");
  return Array.from(
    { length: Math.ceil(slots.length / rowSize) },
    (_, rowIndex) => slots.slice(rowIndex * rowSize, (rowIndex + 1) * rowSize),
  );
}

export function justifiedPhotoColumns(slots: readonly Readonly<{ ratio: PhotoRatio }>[]) {
  return slots.map((slot) => `${photoRatioNumber(slot.ratio)}fr`).join(" ");
}

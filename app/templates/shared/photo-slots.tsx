import type { CSSProperties } from "react";
import type { Work } from "../../site-config";
import type { PhotoRatio } from "../catalog";
import styles from "./photo-slots.module.css";

export type { PhotoRatio } from "../catalog";

export type PhotoSlot = {
  index: number;
  ratio: PhotoRatio;
  work: Work | null;
};

export const photoRatioValue: Record<PhotoRatio, string> = {
  "3:2": "3 / 2",
  "2:3": "2 / 3",
  "16:9": "16 / 9",
};

const photoRatioNumber: Record<PhotoRatio, number> = {
  "3:2": 3 / 2,
  "2:3": 2 / 3,
  "16:9": 16 / 9,
};

type WorkWithSlotIndex = Work & { slotIndex?: unknown };

function getFixedSlotIndex(work: Work, slotCount: number) {
  const slotIndex = (work as WorkWithSlotIndex).slotIndex;
  return typeof slotIndex === "number"
    && Number.isInteger(slotIndex)
    && slotIndex >= 0
    && slotIndex < slotCount
    ? slotIndex
    : null;
}

function getWorkAspectRatio(work: Work) {
  const width = work.previewWidth;
  const height = work.previewHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

function hasCompatibleOrientation(actualRatio: number, targetRatio: number) {
  if (actualRatio === 1) return true;
  return (actualRatio > 1) === (targetRatio > 1);
}

function bitCount(value: number) {
  let count = 0;
  for (let bits = value; bits; bits &= bits - 1) count += 1;
  return count;
}

/**
 * Builds a fixed photo sequence. Explicit zero-based `slotIndex` values win;
 * remaining works are globally matched by the lowest aspect-ratio crop cost.
 * Cross-orientation images are never forced into an incompatible slot, so a
 * missing compatible work remains an intentional editorial placeholder.
 */
export function buildPhotoSlots(works: Work[], ratios: readonly PhotoRatio[]): PhotoSlot[] {
  const slots = ratios.map((ratio, index): PhotoSlot => ({ index, ratio, work: null }));
  const fixedWorkIndexes = new Set<number>();

  works.forEach((work, workIndex) => {
    const slotIndex = getFixedSlotIndex(work, slots.length);
    if (slotIndex === null) return;

    fixedWorkIndexes.add(workIndex);
    if (!slots[slotIndex].work) slots[slotIndex].work = work;
  });

  const openSlotIndexes = slots.flatMap((slot) => slot.work ? [] : [slot.index]);
  const automaticWorks = works.filter((_, workIndex) => !fixedWorkIndexes.has(workIndex));
  if (openSlotIndexes.length === 0 || automaticWorks.length === 0) return slots;

  type MatchState = {
    cost: number;
    assignments: Array<{ openSlotIndex: number; workIndex: number }>;
  };

  let states = new Map<number, MatchState>([[0, { cost: 0, assignments: [] }]]);

  automaticWorks.forEach((work, workIndex) => {
    const actualRatio = getWorkAspectRatio(work);
    if (actualRatio === null) return;

    const nextStates = new Map(states);
    for (const [mask, state] of states) {
      openSlotIndexes.forEach((slotIndex, openSlotIndex) => {
        const bit = 1 << openSlotIndex;
        if ((mask & bit) !== 0) return;

        const targetRatio = photoRatioNumber[slots[slotIndex].ratio];
        if (!hasCompatibleOrientation(actualRatio, targetRatio)) return;

        const nextMask = mask | bit;
        const nextCost = state.cost + Math.abs(Math.log(actualRatio / targetRatio));
        const current = nextStates.get(nextMask);
        if (current && current.cost <= nextCost) return;

        nextStates.set(nextMask, {
          cost: nextCost,
          assignments: [...state.assignments, { openSlotIndex, workIndex }],
        });
      });
    }
    states = nextStates;
  });

  let bestMask = 0;
  let bestState = states.get(0)!;
  for (const [mask, state] of states) {
    const matches = bitCount(mask);
    const bestMatches = bitCount(bestMask);
    if (matches > bestMatches || (matches === bestMatches && state.cost < bestState.cost)) {
      bestMask = mask;
      bestState = state;
    }
  }

  bestState.assignments.forEach(({ openSlotIndex, workIndex }) => {
    slots[openSlotIndexes[openSlotIndex]].work = automaticWorks[workIndex];
  });

  return slots;
}

export function getPhotoSlotStyle(slot: PhotoSlot): CSSProperties {
  return { aspectRatio: photoRatioValue[slot.ratio] };
}

export function PhotoPlaceholder({
  slot,
  className = "",
  tone = "dark",
  compact = false,
  label = "待补充作品",
}: {
  slot: PhotoSlot;
  className?: string;
  tone?: "dark" | "light";
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      className={`${styles.placeholder} ${compact ? styles.compact : ""} ${className}`}
      data-tone={tone}
      data-photo-slot={slot.index + 1}
      data-photo-ratio={slot.ratio}
      role="img"
      aria-label={`第 ${slot.index + 1} 个摄影作品位，${slot.ratio}，${label}`}
    >
      <span className={styles.index}>{String(slot.index + 1).padStart(2, "0")}</span>
      <div className={styles.copy}>
        <strong>{label}</strong>
        <small>PHOTO SLOT / {slot.ratio}</small>
      </div>
      <span className={styles.corner}>PHOTO</span>
    </div>
  );
}

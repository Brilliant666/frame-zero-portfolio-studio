import type { CSSProperties } from "react";
import type { Work } from "../../site-config";
import styles from "./photo-slots.module.css";

export type PhotoRatio = "3:2" | "2:3" | "16:9";

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

function prefersPortrait(work: Work) {
  return work.previewHeight > work.previewWidth;
}

/**
 * Builds a fixed photo sequence while matching portrait originals to portrait
 * slots first. Missing works stay visible as intentional editorial placeholders.
 */
export function buildPhotoSlots(works: Work[], ratios: readonly PhotoRatio[]): PhotoSlot[] {
  const remaining = [...works];

  return ratios.map((ratio, index) => {
    const wantsPortrait = ratio === "2:3";
    const preferredIndex = remaining.findIndex((work) => prefersPortrait(work) === wantsPortrait);
    const workIndex = preferredIndex >= 0 ? preferredIndex : 0;
    const [work] = remaining.splice(workIndex, 1);

    return { index, ratio, work: work ?? null };
  });
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
      <span className={styles.corner}>FRAME//ZERO</span>
    </div>
  );
}

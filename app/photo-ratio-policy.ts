import type { PhotoRatio, TemplateId } from "./templates/catalog";

export type IntrinsicPhotoOrientation = "landscape" | "portrait" | "square";
export type PrimaryPhotoRatio = Exclude<PhotoRatio, "16:9">;
export type TemplateSlotOrientationMode = "fixed" | "source-adaptive";

// Film Rail and Orbital Portal are intentionally single-orientation systems.
// Character Select is entirely source-adaptive. The remaining templates keep
// only their structural hero/cover/feature slots fixed; ordinary gallery slots
// present each source as 3:2 or 2:3 without changing its stable slot identity.
const fixedSlotIndexesByTemplate: Readonly<Record<TemplateId, "all" | readonly number[]>> = Object.freeze({
  "cinematic-light": Object.freeze([0, 8]),
  "neon-hud": Object.freeze([0, 8]),
  "film-rail": "all",
  "manga-panels": Object.freeze([0, 2, 6]),
  "prism-liquid": Object.freeze([0, 1, 5]),
  "orbital-portal": "all",
  "archive-os": Object.freeze([0]),
  "editorial-duet": Object.freeze([0, 2, 5, 8]),
  "polaroid-field": Object.freeze([4, 8]),
  "character-select": Object.freeze([]),
  "museum-depth": Object.freeze([0, 2]),
});

export function templateSlotOrientationMode(
  templateId: TemplateId,
  slotIndex: number,
): TemplateSlotOrientationMode {
  if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) return "fixed";
  const fixedSlots = fixedSlotIndexesByTemplate[templateId];
  return fixedSlots === "all" || fixedSlots.includes(slotIndex) ? "fixed" : "source-adaptive";
}

export function hasSourceOrientationAdaptiveSlots(templateId: TemplateId) {
  return fixedSlotIndexesByTemplate[templateId] !== "all";
}

export function intrinsicPhotoOrientation(
  width: number,
  height: number,
): IntrinsicPhotoOrientation | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (width > height) return "landscape";
  if (width < height) return "portrait";
  return "square";
}

/**
 * Primary assignment has two directional targets. Square remains an intrinsic
 * source identity and uses the landscape presentation only as a crop target.
 */
export function primaryPhotoRatioForOrientation(
  orientation: IntrinsicPhotoOrientation,
): PrimaryPhotoRatio {
  return orientation === "portrait" ? "2:3" : "3:2";
}

export function primaryPhotoRatioForDimensions(
  width: number,
  height: number,
): PrimaryPhotoRatio | null {
  const orientation = intrinsicPhotoOrientation(width, height);
  return orientation ? primaryPhotoRatioForOrientation(orientation) : null;
}

/** 16:9 remains a presentation crop, never a distinct primary assignment type. */
export function normalizePrimaryAssignmentRatio(ratio: PhotoRatio): PrimaryPhotoRatio {
  return ratio === "2:3" ? "2:3" : "3:2";
}

export function photoRatioNumber(ratio: PhotoRatio) {
  if (ratio === "2:3") return 2 / 3;
  if (ratio === "16:9") return 16 / 9;
  return 3 / 2;
}

export function primaryAssignmentRatioNumber(ratio: PhotoRatio) {
  return photoRatioNumber(normalizePrimaryAssignmentRatio(ratio));
}

export function isSourceOrientationAdaptiveTemplate(templateId: TemplateId) {
  return templateId === "character-select";
}

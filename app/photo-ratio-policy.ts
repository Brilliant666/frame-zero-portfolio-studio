import type { PhotoRatio, TemplateId } from "./templates/catalog";

export type IntrinsicPhotoOrientation = "landscape" | "portrait" | "square";
export type PrimaryPhotoRatio = Exclude<PhotoRatio, "16:9">;

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

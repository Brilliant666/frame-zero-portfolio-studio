import {
  assignComposition,
  type CompositionAssignmentResult,
  type CompositionPlacementIntent,
} from "../template-composition/assignment";
import {
  type CompositionRatio,
  type TemplateCompositionVariant,
} from "../template-composition/contract";
import {
  normalizePrimaryAssignmentRatio,
  primaryPhotoRatioForOrientation,
  templateSlotOrientationMode,
} from "../photo-ratio-policy";
import {
  assetToWork,
  autoComposeTemplateWorks,
  retargetWorkToSlot,
  type PhotoAsset,
  type PhotoOrientation,
} from "../photo-library";
import type { SiteContent, Work } from "../site-config";
import type { TemplateId } from "./catalog";
import {
  getTemplateMaterialProfile,
  type TemplateMaterialProfile,
} from "./material-profiles";

const PREVIEW_VARIANT_ID = "classic-preview" as const;
const compositionRatios = new Set<CompositionRatio>(["3:2", "2:3", "16:9"]);

export type TemplateMaterialShortage = Readonly<{
  orientation: PhotoOrientation;
  minimumMissing: number;
  recommendedMissing: number;
}>;

export type TemplatePreviewMaterialStatus = "material-ready" | "material-usable" | "material-short";

export type PlannedTemplateCompositionPreview = Readonly<{
  status: "planned";
  templateId: TemplateId;
  variantId: typeof PREVIEW_VARIANT_ID;
  works: readonly Work[];
  assignments: Extract<CompositionAssignmentResult, { status: "assigned" }>["assignments"];
  filledPhotoCount: number;
  placeholderCount: number;
  heroMissingCount: number;
  materialStatus: TemplatePreviewMaterialStatus;
  shortages: readonly TemplateMaterialShortage[];
  assignment: Extract<CompositionAssignmentResult, { status: "assigned" }>;
}>;

export type TemplateCompositionPreview =
  | PlannedTemplateCompositionPreview
  | Readonly<{
      status: "blocked";
      templateId: TemplateId;
      reason: string;
      assignment: Extract<CompositionAssignmentResult, { status: "blocked" }>;
    }>
  | Readonly<{
      status: "invalid";
      templateId: TemplateId;
      reason: string;
      assignment: Extract<CompositionAssignmentResult, { status: "invalid" }>;
    }>;

function roleForSlot(profile: TemplateMaterialProfile, slotIndex: number) {
  return profile.visualPriority.find((priority) => priority.slotIndex === slotIndex)?.role ?? "gallery";
}

function adaptivePreviewRatios(
  profile: TemplateMaterialProfile,
  assets: readonly PhotoAsset[],
  existingWorks: readonly Work[],
) {
  const isAdaptiveSlot = (slotIndex: number) => (
    templateSlotOrientationMode(profile.templateId, slotIndex) === "source-adaptive"
  );
  if (!profile.slotAspectTargets.some((_, slotIndex) => isAdaptiveSlot(slotIndex))) {
    return profile.slotAspectTargets;
  }

  const ratios = profile.slotAspectTargets.map((ratio, slotIndex) => (
    isAdaptiveSlot(slotIndex) ? normalizePrimaryAssignmentRatio(ratio) : ratio
  ));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const stableAssets = [...assets].sort((left, right) => left.id.localeCompare(right.id));
  const plannedWorks = autoComposeTemplateWorks(
    stableAssets,
    profile.slotAspectTargets,
    existingWorks.map((work) => ({ ...work, locked: true })),
    { templateId: profile.templateId },
  );
  for (const [fallbackIndex, work] of plannedWorks.entries()) {
    const slotIndex = Number.isInteger(work.slotIndex) ? work.slotIndex as number : fallbackIndex;
    if (!isAdaptiveSlot(slotIndex) || !work.assetId) continue;
    const asset = assetById.get(work.assetId);
    if (asset) ratios[slotIndex] = primaryPhotoRatioForOrientation(asset.orientation);
  }
  return Object.freeze(ratios);
}

function previewVariant(
  profile: TemplateMaterialProfile,
  assignmentRatios: readonly CompositionRatio[] = profile.slotAspectTargets,
): TemplateCompositionVariant {
  return Object.freeze({
    variantId: PREVIEW_VARIANT_ID,
    fallbackPriority: 0,
    label: "Preview",
    description: "Ephemeral formal-slot preview.",
    designIntent: "Preview only.",
    slots: Object.freeze(assignmentRatios.map((displayRatio, slotIndex) => {
      const priority = profile.visualPriority.find((item) => item.slotIndex === slotIndex);
      const secondaryPresentations = profile.secondaryPresentations.flatMap((presentation, presentationIndex) => (
        presentation.slotIndexes.includes(slotIndex) && compositionRatios.has(presentation.target as CompositionRatio)
          ? [Object.freeze({
              presentationKey: `secondary-${String(presentationIndex + 1).padStart(2, "0")}`,
              ratio: presentation.target as CompositionRatio,
              critical: presentation.critical,
            })]
          : []
      ));
      if (displayRatio === "16:9") {
        secondaryPresentations.push(Object.freeze({
          presentationKey: "secondary-slot-display-16-9",
          ratio: "16:9" as const,
          critical: false,
        }));
      }

      return Object.freeze({
        slotIndex,
        slotKey: `slot-${String(slotIndex + 1).padStart(2, "0")}`,
        logicalRole: roleForSlot(profile, slotIndex),
        assignmentRatio: normalizePrimaryAssignmentRatio(displayRatio),
        critical: priority?.level === "critical",
        secondaryPresentations: Object.freeze(secondaryPresentations),
      });
    })),
  });
}

function placementIntents(existingWorks: readonly Work[], slotCount: number, lockedOnly: boolean) {
  const intents: CompositionPlacementIntent[] = [];
  for (const [fallbackIndex, work] of existingWorks.entries()) {
    if (lockedOnly && work.locked !== true) continue;
    if (!work.assetId) continue;
    const slotIndex = Number.isInteger(work.slotIndex) ? work.slotIndex as number : fallbackIndex;
    if (slotIndex < 0 || slotIndex >= slotCount) continue;
    intents.push(Object.freeze({ assetId: work.assetId, slotIndex }));
  }
  return Object.freeze(intents);
}

function demandShortages(profile: TemplateMaterialProfile, assets: readonly PhotoAsset[]) {
  const available = assets.reduce<Record<PhotoOrientation, number>>((counts, asset) => {
    counts[asset.orientation] += 1;
    return counts;
  }, { landscape: 0, portrait: 0, square: 0 });
  const demands = {
    landscape: profile.landscapeDemand,
    portrait: profile.portraitDemand,
    square: profile.squareDemand,
  } as const;

  return Object.freeze((Object.keys(demands) as PhotoOrientation[]).map((orientation) => Object.freeze({
    orientation,
    minimumMissing: Math.max(0, demands[orientation].minimum - available[orientation]),
    recommendedMissing: Math.max(0, demands[orientation].recommended - available[orientation]),
  })));
}

function safeReason(assignment: Exclude<CompositionAssignmentResult, { status: "assigned" }>) {
  if (assignment.status === "blocked") return "锁定槽位与素材库冲突；请先检查素材排版。";
  return "预览排版失败；请刷新素材列表后重试。";
}

/**
 * Produces an ephemeral, deterministic classic-layout preview from the local manifest.
 * It delegates all matching to the accepted pure Composition assignment engine and performs no I/O.
 */
export function planTemplateCompositionPreview({
  templateId,
  assets,
  existingWorks = [],
}: Readonly<{
  templateId: TemplateId;
  assets: readonly PhotoAsset[];
  existingWorks?: readonly Work[];
}>): TemplateCompositionPreview {
  const profile = getTemplateMaterialProfile(templateId);
  const assignmentRatios = adaptivePreviewRatios(profile, assets, existingWorks);
  const assignment = assignComposition({
    variant: previewVariant(profile, assignmentRatios),
    assets: assets.map((asset) => ({
      assetId: asset.id,
      aspectRatio: asset.aspectRatio,
      orientation: asset.orientation,
    })),
    existingIntent: placementIntents(existingWorks, profile.maximumUsefulPhotoCount, false),
    locks: placementIntents(existingWorks, profile.maximumUsefulPhotoCount, true),
  });

  if (assignment.status === "blocked") {
    return Object.freeze({
      status: "blocked",
      templateId,
      reason: safeReason(assignment),
      assignment,
    });
  }
  if (assignment.status === "invalid") {
    return Object.freeze({
      status: "invalid",
      templateId,
      reason: safeReason(assignment),
      assignment,
    });
  }

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const existingByAssetId = new Map(existingWorks.flatMap((work) => (
    work.assetId ? [[work.assetId, work] as const] : []
  )));
  const works = assignment.assignments.flatMap((slotAssignment) => {
    if (!slotAssignment.assetId) return [];
    const asset = assetById.get(slotAssignment.assetId);
    if (!asset) return [];
    const existing = existingByAssetId.get(slotAssignment.assetId);
    const work = existing
      ? { ...retargetWorkToSlot(existing, slotAssignment.slotIndex), locked: slotAssignment.locked }
      : { ...assetToWork(asset, slotAssignment.slotIndex), locked: slotAssignment.locked };
    return [Object.freeze(work)];
  });
  const shortages = demandShortages(profile, assets);
  const filledPhotoCount = works.length;
  const assignedSlotIndexes = new Set(
    assignment.assignments.flatMap((slotAssignment) => slotAssignment.assetId ? [slotAssignment.slotIndex] : []),
  );
  const heroSlotIndexes = profile.visualPriority
    .filter((priority) => priority.role === "hero" || priority.role === "cover")
    .slice(0, profile.heroSlotCount)
    .map((priority) => priority.slotIndex);
  const heroMissingCount = heroSlotIndexes.filter((slotIndex) => !assignedSlotIndexes.has(slotIndex)).length;
  const missesMinimum = shortages.some(({ minimumMissing }) => minimumMissing > 0);
  const missesRecommendation = shortages.some(({ recommendedMissing }) => recommendedMissing > 0);
  const materialStatus: TemplatePreviewMaterialStatus = (
    filledPhotoCount < profile.minimumUsefulPhotoCount
    || assignment.metrics.criticalSlotMissing > 0
    || missesMinimum
  )
    ? "material-short"
    : filledPhotoCount < profile.recommendedPhotoCount || missesRecommendation
      ? "material-usable"
      : "material-ready";

  return Object.freeze({
    status: "planned",
    templateId,
    variantId: PREVIEW_VARIANT_ID,
    works: Object.freeze(works),
    assignments: assignment.assignments,
    filledPhotoCount,
    placeholderCount: assignment.metrics.placeholderCount,
    heroMissingCount,
    materialStatus,
    shortages,
    assignment,
  });
}

/** Applies an already-reviewed preview to one template in the local draft only. */
export function applyTemplateCompositionPreview(
  content: SiteContent,
  preview: PlannedTemplateCompositionPreview,
): SiteContent {
  return {
    ...content,
    templateWorks: {
      ...content.templateWorks,
      [preview.templateId]: preview.works.map((work) => ({ ...work })),
    },
  };
}

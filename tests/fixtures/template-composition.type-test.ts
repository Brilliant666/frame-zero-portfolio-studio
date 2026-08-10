import {
  assignComposition,
  planComposition,
  validateCompositionVariantRegistry,
  type CompositionAssetCandidate,
  type CompositionPlanResult,
  type CompositionPlannerMode,
  type CompositionSlotDefinition,
  type CompositionVariantRegistry,
  type TemplateCompositionVariant,
} from "../../app/template-composition/index";

const slot: CompositionSlotDefinition = {
  slotIndex: 0,
  slotKey: "hero-slot",
  logicalRole: "hero",
  assignmentRatio: "2:3",
  critical: true,
  secondaryPresentations: [{
    presentationKey: "wide-stage",
    ratio: "3:2",
    critical: true,
  }],
};

const variant: TemplateCompositionVariant = {
  variantId: "classic",
  fallbackPriority: 0,
  slots: [slot],
};

const registry: CompositionVariantRegistry = {
  templateId: "synthetic-template",
  templateVersion: 1,
  variants: [variant],
};

const asset: CompositionAssetCandidate = {
  assetId: "asset-a",
  aspectRatio: 2 / 3,
  orientation: "portrait",
};

const mode: CompositionPlannerMode = "RECOMMEND_VARIANT";
const validation = validateCompositionVariantRegistry(registry);
if (validation.ok) validation.registry.variants[0].slots[0].assignmentRatio satisfies "2:3" | "3:2" | "16:9";

const assignment = assignComposition({ variant, assets: [asset] });
if (assignment.status === "assigned") assignment.assignments[0].assetId satisfies string | null;
if (assignment.status === "blocked") assignment.lockedConflicts[0]?.code satisfies string | undefined;
if (assignment.status === "invalid") assignment.issues[0]?.path satisfies string | undefined;

const result: CompositionPlanResult = planComposition({ registry, assets: [asset], mode });
if (result.status === "planned") {
  result.chosenVariantId satisfies string;
  result.score.totalCropPressureUnits satisfies number;
} else if (result.status === "blocked") {
  result.reason satisfies "all-variants-blocked" | "current-variant-blocked" | "current-variant-unavailable";
} else {
  result.issues[0]?.code satisfies string | undefined;
}

// @ts-expect-error 1:1 is intentionally not a first-version composition ratio.
const unsupportedRatio: CompositionSlotDefinition = { ...slot, assignmentRatio: "1:1" };

// @ts-expect-error planner modes are explicit and closed.
const unsupportedMode: CompositionPlannerMode = "AUTO";

void unsupportedRatio;
void unsupportedMode;

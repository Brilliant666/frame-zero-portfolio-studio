import {
  validateCompositionVariantRegistry,
  type RegistryValidationError,
  type TemplateCompositionVariant,
} from "./contract.js";
import {
  assignComposition,
  type AssignmentInputIssue,
  type CompositionAssetCandidate,
  type CompositionAssignmentWarning,
  type CompositionPlacementIntent,
  type CompositionSlotAssignment,
  type LockedConflict,
} from "./assignment.js";

export const COMPOSITION_PLANNER_MODES = Object.freeze([
  "KEEP_CURRENT_VARIANT",
  "RECOMMEND_VARIANT",
] as const);
export type CompositionPlannerMode = (typeof COMPOSITION_PLANNER_MODES)[number];

export const MINIMUM_MEAN_CROP_IMPROVEMENT_TO_SWITCH_UNITS = 20_000 as const;
export const MAX_PLANNING_WORK_UNITS = 8_000_000 as const;

export type CompositionPlanScore = Readonly<{
  lockedConflictCount: number;
  criticalSlotMissing: number;
  placeholderCount: number;
  orientationShortage: number;
  criticalSecondaryProjectionCostUnits: number;
  totalCropPressureUnits: number;
  squareUsePenaltyUnits: number;
  existingIntentChurn: number;
  designDeviation: number;
  fallbackPriority: number;
  variantId: string;
}>;

export type CompositionVariantEvaluation =
  | Readonly<{
      status: "assigned";
      variantId: string;
      score: CompositionPlanScore;
      assignments: readonly CompositionSlotAssignment[];
      warnings: readonly CompositionAssignmentWarning[];
    }>
  | Readonly<{
      status: "blocked";
      variantId: string;
      lockedConflicts: readonly LockedConflict[];
    }>;

export type CompositionPlannerIssue =
  | RegistryValidationError
  | AssignmentInputIssue
  | Readonly<{
      code:
        | "invalid_current_variant_id"
        | "invalid_mode"
        | "invalid_planner_input"
        | "planning_workload_exceeded";
      path: string;
      message: string;
    }>;

export type CompositionPlanResult =
  | Readonly<{
      status: "planned";
      templateId: string;
      templateVersion: number;
      mode: CompositionPlannerMode;
      chosenVariantId: string;
      recommendationReason:
        | "best-score"
        | "hysteresis-kept-classic"
        | "hysteresis-kept-current"
        | "kept-current-variant";
      score: CompositionPlanScore;
      assignments: readonly CompositionSlotAssignment[];
      warnings: readonly CompositionAssignmentWarning[];
      evaluations: readonly CompositionVariantEvaluation[];
    }>
  | Readonly<{
      status: "blocked";
      reason: "all-variants-blocked" | "current-variant-blocked" | "current-variant-unavailable";
      currentVariantId: string | null;
      evaluations: readonly CompositionVariantEvaluation[];
    }>
  | Readonly<{
      status: "invalid";
      issues: readonly CompositionPlannerIssue[];
    }>;

export type CompositionPlanInput = Readonly<{
  registry: unknown;
  assets: readonly CompositionAssetCandidate[];
  existingIntent?: readonly CompositionPlacementIntent[];
  locks?: readonly CompositionPlacementIntent[];
  currentVariantId?: string;
  mode: CompositionPlannerMode;
  squarePenaltyUnits?: number;
}>;

type SafeRecord = Record<string, unknown>;

const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const scoreNumericKeys = [
  "lockedConflictCount",
  "criticalSlotMissing",
  "placeholderCount",
  "orientationShortage",
  "criticalSecondaryProjectionCostUnits",
  "totalCropPressureUnits",
  "squareUsePenaltyUnits",
  "existingIntentChurn",
  "designDeviation",
  "fallbackPriority",
] as const;

function freezeArray<T>(values: readonly T[]) {
  return Object.freeze([...values]) as readonly T[];
}

function inspectPlannerInput(value: unknown): SafeRecord | null {
  if (value === null || typeof value !== "object") return null;
  try {
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const allowed = new Set([
      "registry",
      "assets",
      "existingIntent",
      "locks",
      "currentVariantId",
      "mode",
      "squarePenaltyUnits",
    ]);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).some((key) => !allowed.has(key) || !("value" in descriptors[key]))) {
      return null;
    }
    return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [
      key,
      (descriptor as PropertyDescriptor & { value: unknown }).value,
    ]));
  } catch {
    return null;
  }
}

function safelyInspectArrayLength(value: unknown) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const descriptor = descriptors.length;
    return descriptor && "value" in descriptor && Number.isSafeInteger(descriptor.value)
      ? descriptor.value as number
      : null;
  } catch {
    return null;
  }
}

function invalid(issues: readonly CompositionPlannerIssue[]): CompositionPlanResult {
  return Object.freeze({
    status: "invalid",
    issues: freezeArray([...issues].sort((left, right) => (
      left.path < right.path ? -1
        : left.path > right.path ? 1
          : left.code < right.code ? -1
            : left.code > right.code ? 1
              : left.message < right.message ? -1 : left.message > right.message ? 1 : 0
    ))),
  });
}

export function compareCompositionPlanScores(left: CompositionPlanScore, right: CompositionPlanScore) {
  for (const key of scoreNumericKeys) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return left.variantId < right.variantId ? -1 : left.variantId > right.variantId ? 1 : 0;
}

function scoreFor(
  variant: TemplateCompositionVariant,
  result: Extract<ReturnType<typeof assignComposition>, { status: "assigned" }>,
  designDeviation: number,
): CompositionPlanScore {
  const metrics = result.metrics;
  return Object.freeze({
    lockedConflictCount: 0,
    criticalSlotMissing: metrics.criticalSlotMissing,
    placeholderCount: metrics.placeholderCount,
    orientationShortage: metrics.orientationShortage,
    criticalSecondaryProjectionCostUnits: metrics.criticalSecondaryProjectionCostUnits,
    totalCropPressureUnits: metrics.totalCropPressureUnits,
    squareUsePenaltyUnits: metrics.squareUsePenaltyUnits,
    existingIntentChurn: metrics.existingIntentChurn,
    designDeviation,
    fallbackPriority: variant.fallbackPriority,
    variantId: variant.variantId,
  });
}

function evaluateVariant(
  variant: TemplateCompositionVariant,
  input: SafeRecord,
  designDeviation: number,
): CompositionVariantEvaluation | Readonly<{ status: "invalid"; issues: readonly AssignmentInputIssue[] }> {
  const result = assignComposition({
    variant,
    assets: input.assets as readonly CompositionAssetCandidate[],
    ...(input.existingIntent !== undefined
      ? { existingIntent: input.existingIntent as readonly CompositionPlacementIntent[] }
      : {}),
    ...(input.locks !== undefined ? { locks: input.locks as readonly CompositionPlacementIntent[] } : {}),
    ...(input.squarePenaltyUnits !== undefined ? { squarePenaltyUnits: input.squarePenaltyUnits as number } : {}),
  });
  if (result.status === "invalid") return Object.freeze({ status: "invalid", issues: result.issues });
  if (result.status === "blocked") {
    return Object.freeze({
      status: "blocked",
      variantId: variant.variantId,
      lockedConflicts: freezeArray(result.lockedConflicts),
    });
  }
  return Object.freeze({
    status: "assigned",
    variantId: variant.variantId,
    score: scoreFor(variant, result, designDeviation),
    assignments: freezeArray(result.assignments),
    warnings: freezeArray(result.warnings),
  });
}

function shouldKeepCurrentForHysteresis(
  current: Extract<CompositionVariantEvaluation, { status: "assigned" }>,
  best: Extract<CompositionVariantEvaluation, { status: "assigned" }>,
) {
  if (current.variantId === best.variantId) return false;
  const currentScore = current.score;
  const bestScore = best.score;
  if (
    currentScore.lockedConflictCount !== bestScore.lockedConflictCount
    || currentScore.criticalSlotMissing !== bestScore.criticalSlotMissing
    || currentScore.placeholderCount !== bestScore.placeholderCount
    || currentScore.orientationShortage !== bestScore.orientationShortage
    || currentScore.criticalSecondaryProjectionCostUnits !== bestScore.criticalSecondaryProjectionCostUnits
    || currentScore.squareUsePenaltyUnits !== bestScore.squareUsePenaltyUnits
  ) return false;

  const improvement = currentScore.totalCropPressureUnits - bestScore.totalCropPressureUnits;
  if (improvement <= 0) return false;
  const filledSlots = Math.max(1, current.assignments.length - currentScore.placeholderCount);
  return improvement < MINIMUM_MEAN_CROP_IMPROVEMENT_TO_SWITCH_UNITS * filledSlots;
}

/**
 * Evaluates approved immutable variants without I/O or persistence. It never infers or mutates
 * production template state; callers must explicitly choose KEEP or RECOMMEND semantics.
 */
export function planComposition(input: CompositionPlanInput): CompositionPlanResult {
  const root = inspectPlannerInput(input);
  if (
    !root
    || !Object.prototype.hasOwnProperty.call(root, "registry")
    || !Object.prototype.hasOwnProperty.call(root, "assets")
    || !Object.prototype.hasOwnProperty.call(root, "mode")
  ) {
    return invalid([Object.freeze({
      code: "invalid_planner_input",
      path: "$",
      message: "Planner input must be a safe record with registry, assets, and mode.",
    })]);
  }
  if (root.mode !== "KEEP_CURRENT_VARIANT" && root.mode !== "RECOMMEND_VARIANT") {
    return invalid([Object.freeze({
      code: "invalid_mode",
      path: "$.mode",
      message: "Mode must be KEEP_CURRENT_VARIANT or RECOMMEND_VARIANT.",
    })]);
  }
  if (
    root.currentVariantId !== undefined
    && (
      typeof root.currentVariantId !== "string"
      || root.currentVariantId.length > 64
      || !STABLE_ID_PATTERN.test(root.currentVariantId)
    )
  ) {
    return invalid([Object.freeze({
      code: "invalid_current_variant_id",
      path: "$.currentVariantId",
      message: "Current variant ID must be a canonical lowercase ASCII identifier.",
    })]);
  }

  const validated = validateCompositionVariantRegistry(root.registry);
  if (!validated.ok) return invalid(validated.errors);
  const registry = validated.registry;
  const variants = [...registry.variants].sort((left, right) => (
    left.fallbackPriority - right.fallbackPriority
    || (left.variantId < right.variantId ? -1 : left.variantId > right.variantId ? 1 : 0)
  ));
  const assetCount = safelyInspectArrayLength(root.assets);
  if (assetCount !== null) {
    const slotCount = registry.variants[0].slots.length;
    const evaluationCount = root.mode === "KEEP_CURRENT_VARIANT" ? 1 : registry.variants.length;
    const workload = BigInt(evaluationCount)
      * BigInt(slotCount)
      * BigInt(slotCount)
      * BigInt(assetCount + slotCount);
    if (workload > BigInt(MAX_PLANNING_WORK_UNITS)) {
      return invalid([Object.freeze({
        code: "planning_workload_exceeded",
        path: "$",
        message: `Planning workload exceeds ${MAX_PLANNING_WORK_UNITS} bounded work units.`,
      })]);
    }
  }
  const currentVariantId = typeof root.currentVariantId === "string" ? root.currentVariantId : null;
  if (currentVariantId && !variants.some((variant) => variant.variantId === currentVariantId)) {
    return invalid([Object.freeze({
      code: "invalid_current_variant_id",
      path: "$.currentVariantId",
      message: "Current variant ID is not present in the validated registry.",
    })]);
  }

  if (root.mode === "KEEP_CURRENT_VARIANT") {
    const current = variants.find((variant) => variant.variantId === currentVariantId);
    if (!current) {
      return Object.freeze({
        status: "blocked",
        reason: "current-variant-unavailable",
        currentVariantId,
        evaluations: Object.freeze([]),
      });
    }
    const evaluation = evaluateVariant(current, root, 0);
    if (evaluation.status === "invalid") return invalid(evaluation.issues);
    if (evaluation.status === "blocked") {
      return Object.freeze({
        status: "blocked",
        reason: "current-variant-blocked",
        currentVariantId,
        evaluations: freezeArray([evaluation]),
      });
    }
    return Object.freeze({
      status: "planned",
      templateId: registry.templateId,
      templateVersion: registry.templateVersion,
      mode: root.mode,
      chosenVariantId: current.variantId,
      recommendationReason: "kept-current-variant",
      score: evaluation.score,
      assignments: evaluation.assignments,
      warnings: evaluation.warnings,
      evaluations: freezeArray([evaluation]),
    });
  }

  const evaluations: CompositionVariantEvaluation[] = [];
  const designReferenceVariantId = currentVariantId ?? variants[0].variantId;
  for (const variant of variants) {
    const evaluation = evaluateVariant(variant, root, variant.variantId === designReferenceVariantId ? 0 : 1);
    if (evaluation.status === "invalid") return invalid(evaluation.issues);
    evaluations.push(evaluation);
  }
  const assigned = evaluations
    .filter((evaluation): evaluation is Extract<CompositionVariantEvaluation, { status: "assigned" }> => (
      evaluation.status === "assigned"
    ))
    .sort((left, right) => compareCompositionPlanScores(left.score, right.score));
  if (assigned.length === 0) {
    return Object.freeze({
      status: "blocked",
      reason: "all-variants-blocked",
      currentVariantId,
      evaluations: freezeArray(evaluations),
    });
  }

  const rawBest = assigned[0];
  const current = currentVariantId
    ? assigned.find((evaluation) => evaluation.variantId === currentVariantId)
    : undefined;
  const classic = currentVariantId === null
    ? [...assigned].sort((left, right) => (
        left.score.fallbackPriority - right.score.fallbackPriority
        || (left.variantId < right.variantId ? -1 : left.variantId > right.variantId ? 1 : 0)
      ))[0]
    : undefined;
  const reference = current ?? classic;
  const chosen = reference && shouldKeepCurrentForHysteresis(reference, rawBest) ? reference : rawBest;
  const recommendationReason = chosen !== rawBest
    ? current ? "hysteresis-kept-current" : "hysteresis-kept-classic"
    : "best-score";
  return Object.freeze({
    status: "planned",
    templateId: registry.templateId,
    templateVersion: registry.templateVersion,
    mode: root.mode,
    chosenVariantId: chosen.variantId,
    recommendationReason,
    score: chosen.score,
    assignments: chosen.assignments,
    warnings: chosen.warnings,
    evaluations: freezeArray(evaluations),
  });
}

import {
  compositionContractLimits,
  compositionRatioValue,
  orientationForCompositionRatio,
  validateCompositionVariantRegistry,
  type CompositionOrientation,
  type CompositionRatio,
  type CompositionSlotDefinition,
  type TemplateCompositionVariant,
} from "./contract.js";

export const COMPOSITION_COST_SCALE = 1_000_000 as const;
export const DEFAULT_SQUARE_PENALTY_UNITS = 80_000 as const;
export const MAX_ASSIGNMENT_WORK_UNITS = 8_000_000 as const;

export const compositionAssignmentLimits = Object.freeze({
  assets: 10_000,
  intents: compositionContractLimits.slots,
} as const);

export type CompositionAssetCandidate = Readonly<{
  assetId: string;
  aspectRatio: number;
  orientation: CompositionOrientation;
}>;

export type CompositionPlacementIntent = Readonly<{
  assetId: string;
  slotIndex: number;
}>;

export type AssignmentInputIssueCode =
  | "assignment_workload_exceeded"
  | "duplicate_asset_id"
  | "duplicate_existing_asset"
  | "duplicate_existing_slot"
  | "invalid_asset"
  | "invalid_assets"
  | "invalid_existing_intent"
  | "invalid_existing_intents"
  | "invalid_locks"
  | "invalid_square_penalty"
  | "invalid_variant"
  | "oversized_assets"
  | "oversized_existing_intents"
  | "oversized_locks"
  | "sparse_array";

export type AssignmentInputIssue = Readonly<{
  code: AssignmentInputIssueCode;
  path: string;
  message: string;
}>;

export type LockedConflictCode =
  | "duplicate_locked_asset"
  | "duplicate_locked_slot"
  | "invalid_locked_intent"
  | "locked_asset_missing"
  | "locked_orientation_incompatible"
  | "locked_slot_out_of_range";

export type LockedConflict = Readonly<{
  code: LockedConflictCode;
  assetId: string | null;
  slotIndex: number | null;
  slotKey: string | null;
  message: string;
}>;

export type CompositionSlotAssignment = Readonly<{
  slotIndex: number;
  slotKey: string;
  assetId: string | null;
  locked: boolean;
  assignmentCostUnits: number;
  secondaryProjectionCostUnits: number;
  criticalSecondaryProjectionCostUnits: number;
  squarePenaltyUnits: number;
}>;

export type CompositionAssignmentMetrics = Readonly<{
  criticalSlotMissing: number;
  placeholderCount: number;
  orientationShortage: number;
  landscapeShortage: number;
  portraitShortage: number;
  criticalSecondaryProjectionCostUnits: number;
  totalCropPressureUnits: number;
  squareUseCount: number;
  squareUsePenaltyUnits: number;
  existingIntentChurn: number;
}>;

export type CompositionAssignmentWarning = Readonly<{
  code: "insufficient-compatible-assets" | "square-fallback-used";
  slotIndexes: readonly number[];
  message: string;
}>;

export type CompositionAssignmentResult =
  | Readonly<{
      status: "assigned";
      variantId: string;
      assignments: readonly CompositionSlotAssignment[];
      metrics: CompositionAssignmentMetrics;
      warnings: readonly CompositionAssignmentWarning[];
    }>
  | Readonly<{
      status: "blocked";
      variantId: string;
      lockedConflicts: readonly LockedConflict[];
    }>
  | Readonly<{
      status: "invalid";
      variantId: string | null;
      issues: readonly AssignmentInputIssue[];
    }>;

export type CompositionAssignmentInput = Readonly<{
  variant: TemplateCompositionVariant;
  assets: readonly CompositionAssetCandidate[];
  existingIntent?: readonly CompositionPlacementIntent[];
  locks?: readonly CompositionPlacementIntent[];
  squarePenaltyUnits?: number;
}>;

const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const LEX_COST_WIDTH = 7;

type LexCost = readonly number[];

function freezeArray<T>(values: readonly T[]) {
  return Object.freeze([...values]) as readonly T[];
}

function normalizeInteger(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function addLex(left: LexCost, right: LexCost): LexCost {
  return left.map((value, index) => normalizeInteger(value + right[index]));
}

function subtractLex(left: LexCost, right: LexCost): LexCost {
  return left.map((value, index) => normalizeInteger(value - right[index]));
}

function compareLex(left: LexCost, right: LexCost) {
  for (let index = 0; index < LEX_COST_WIDTH; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

function zeroLex(): LexCost {
  return [0, 0, 0, 0, 0, 0, 0];
}

function minimumLexicographicAssignment(
  rowCount: number,
  columnCount: number,
  cost: (rowIndex: number, columnIndex: number) => LexCost,
) {
  if (rowCount === 0 || columnCount === 0) return [] as Array<[number, number]>;
  if (rowCount > columnCount) throw new Error("Assignment rows must not exceed columns.");

  const rowPotential = Array.from({ length: rowCount + 1 }, zeroLex);
  const columnPotential = Array.from({ length: columnCount + 1 }, zeroLex);
  const matchedRow = new Array<number>(columnCount + 1).fill(0);
  const previousColumn = new Array<number>(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minimum = new Array<LexCost | null>(columnCount + 1).fill(null);
    const used = new Array<boolean>(columnCount + 1).fill(false);

    do {
      used[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta: LexCost | null = null;
      let nextColumn = 0;

      for (let column = 1; column <= columnCount; column += 1) {
        if (used[column]) continue;
        const reduced = subtractLex(
          subtractLex(cost(currentRow - 1, column - 1), rowPotential[currentRow]),
          columnPotential[column],
        );
        const previousMinimum = minimum[column];
        if (previousMinimum === null || compareLex(reduced, previousMinimum) < 0) {
          minimum[column] = reduced;
          previousColumn[column] = currentColumn;
        }
        const candidateMinimum = minimum[column]!;
        if (delta === null || compareLex(candidateMinimum, delta) < 0) {
          delta = candidateMinimum;
          nextColumn = column;
        }
      }

      if (delta === null) throw new Error("The assignment matrix has no augmenting path.");
      for (let column = 0; column <= columnCount; column += 1) {
        if (used[column]) {
          rowPotential[matchedRow[column]] = addLex(rowPotential[matchedRow[column]], delta);
          columnPotential[column] = subtractLex(columnPotential[column], delta);
        } else {
          const candidateMinimum = minimum[column];
          if (candidateMinimum !== null) minimum[column] = subtractLex(candidateMinimum, delta);
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const previous = previousColumn[currentColumn];
      matchedRow[currentColumn] = matchedRow[previous];
      currentColumn = previous;
    } while (currentColumn !== 0);
  }

  const pairs: Array<[number, number]> = [];
  for (let column = 1; column <= columnCount; column += 1) {
    if (matchedRow[column] > 0) pairs.push([matchedRow[column] - 1, column - 1]);
  }
  return pairs.sort((left, right) => left[0] - right[0]);
}

function inspectKnownRecord(value: unknown, allowedKeys: readonly string[]) {
  if (value === null || typeof value !== "object") return null;
  try {
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    if (Object.keys(descriptors).some((key) => !allowedKeys.includes(key) || !("value" in descriptors[key]))) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(descriptors).map(([key, descriptor]) => [
        key,
        (descriptor as PropertyDescriptor & { value: unknown }).value,
      ]),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function snapshotArray(
  value: unknown,
  path: string,
  maximum: number,
  invalidCode: AssignmentInputIssueCode,
  oversizedCode: AssignmentInputIssueCode,
): Readonly<{ values: readonly unknown[] | null; issue: AssignmentInputIssue | null }> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return Object.freeze({ values: null, issue: Object.freeze({ code: invalidCode, path, message: "Expected a standard array." }) });
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return Object.freeze({ values: null, issue: Object.freeze({ code: invalidCode, path, message: "Array symbol properties are not allowed." }) });
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
      return Object.freeze({ values: null, issue: Object.freeze({ code: invalidCode, path, message: "Array length is unsafe." }) });
    }
    const length = lengthDescriptor.value as number;
    if (length > maximum) {
      return Object.freeze({ values: null, issue: Object.freeze({ code: oversizedCode, path, message: `Array exceeds ${maximum} entries.` }) });
    }
    for (const key of Object.keys(descriptors).sort()) {
      if (key === "length") continue;
      if (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= length || !("value" in descriptors[key])) {
        return Object.freeze({ values: null, issue: Object.freeze({ code: invalidCode, path: `${path}[${JSON.stringify(key)}]`, message: "Array contains an unsafe property." }) });
      }
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor) {
        return Object.freeze({ values: null, issue: Object.freeze({ code: "sparse_array", path: `${path}[${index}]`, message: "Sparse arrays are not allowed." }) });
      }
      if (!("value" in descriptor)) {
        return Object.freeze({ values: null, issue: Object.freeze({ code: invalidCode, path: `${path}[${index}]`, message: "Array accessors are not allowed." }) });
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze({ values: Object.freeze(snapshot), issue: null });
  } catch {
    return Object.freeze({ values: null, issue: Object.freeze({ code: invalidCode, path, message: "Array could not be inspected safely." }) });
  }
}

function orientationForAspectRatio(aspectRatio: number): CompositionOrientation {
  if (aspectRatio > 1) return "landscape";
  if (aspectRatio < 1) return "portrait";
  return "square";
}

export function isAssetCompatibleWithSlot(
  asset: CompositionAssetCandidate,
  slot: CompositionSlotDefinition,
) {
  return asset.orientation === "square"
    || asset.orientation === orientationForCompositionRatio(slot.assignmentRatio);
}

export function ratioCostUnits(aspectRatio: number, targetRatio: CompositionRatio) {
  return Math.round(Math.abs(Math.log(aspectRatio / compositionRatioValue(targetRatio))) * COMPOSITION_COST_SCALE);
}

function parseAssets(value: unknown) {
  const issues: AssignmentInputIssue[] = [];
  const snapshot = snapshotArray(value, "$.assets", compositionAssignmentLimits.assets, "invalid_assets", "oversized_assets");
  if (snapshot.issue) return { assets: [] as CompositionAssetCandidate[], issues: [snapshot.issue] };

  const assets: CompositionAssetCandidate[] = [];
  const ids = new Set<string>();
  snapshot.values!.forEach((entry, index) => {
    const path = `$.assets[${index}]`;
    const record = inspectKnownRecord(entry, ["assetId", "aspectRatio", "orientation"]);
    if (
      !record
      || typeof record.assetId !== "string"
      || !ASSET_ID_PATTERN.test(record.assetId)
      || typeof record.aspectRatio !== "number"
      || !Number.isFinite(record.aspectRatio)
      || record.aspectRatio < 0.05
      || record.aspectRatio > 20
      || (record.orientation !== "landscape" && record.orientation !== "portrait" && record.orientation !== "square")
      || orientationForAspectRatio(record.aspectRatio) !== record.orientation
    ) {
      issues.push(Object.freeze({ code: "invalid_asset", path, message: "Asset identity, ratio, or orientation is invalid." }));
      return;
    }
    if (ids.has(record.assetId)) {
      issues.push(Object.freeze({ code: "duplicate_asset_id", path: `${path}.assetId`, message: "Asset ID is duplicated." }));
      return;
    }
    ids.add(record.assetId);
    assets.push(Object.freeze({
      assetId: record.assetId,
      aspectRatio: record.aspectRatio,
      orientation: record.orientation,
    }));
  });
  assets.sort((left, right) => left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0);
  return { assets, issues };
}

function parseExistingIntent(value: unknown, slotCount: number) {
  if (value === undefined) return { intents: [] as CompositionPlacementIntent[], issues: [] as AssignmentInputIssue[] };
  const snapshot = snapshotArray(
    value,
    "$.existingIntent",
    compositionAssignmentLimits.intents,
    "invalid_existing_intents",
    "oversized_existing_intents",
  );
  if (snapshot.issue) return { intents: [] as CompositionPlacementIntent[], issues: [snapshot.issue] };

  const intents: CompositionPlacementIntent[] = [];
  const assetIds = new Set<string>();
  const slotIndexes = new Set<number>();
  const issues: AssignmentInputIssue[] = [];
  snapshot.values!.forEach((entry, index) => {
    const path = `$.existingIntent[${index}]`;
    const record = inspectKnownRecord(entry, ["assetId", "slotIndex"]);
    if (
      !record
      || typeof record.assetId !== "string"
      || !ASSET_ID_PATTERN.test(record.assetId)
      || !Number.isSafeInteger(record.slotIndex)
      || (record.slotIndex as number) < 0
      || (record.slotIndex as number) >= slotCount
    ) {
      issues.push(Object.freeze({ code: "invalid_existing_intent", path, message: "Existing intent is invalid." }));
      return;
    }
    if (assetIds.has(record.assetId)) {
      issues.push(Object.freeze({ code: "duplicate_existing_asset", path: `${path}.assetId`, message: "Existing asset intent is duplicated." }));
      return;
    }
    if (slotIndexes.has(record.slotIndex as number)) {
      issues.push(Object.freeze({ code: "duplicate_existing_slot", path: `${path}.slotIndex`, message: "Existing slot intent is duplicated." }));
      return;
    }
    assetIds.add(record.assetId);
    slotIndexes.add(record.slotIndex as number);
    intents.push(Object.freeze({ assetId: record.assetId, slotIndex: record.slotIndex as number }));
  });
  intents.sort((left, right) => left.slotIndex - right.slotIndex || (left.assetId < right.assetId ? -1 : 1));
  return { intents, issues };
}

function parseLocks(
  value: unknown,
  variant: TemplateCompositionVariant,
  assetMap: ReadonlyMap<string, CompositionAssetCandidate>,
) {
  if (value === undefined) return { locks: [] as CompositionPlacementIntent[], conflicts: [] as LockedConflict[], issues: [] as AssignmentInputIssue[] };
  const snapshot = snapshotArray(value, "$.locks", compositionAssignmentLimits.intents, "invalid_locks", "oversized_locks");
  if (snapshot.issue) return { locks: [] as CompositionPlacementIntent[], conflicts: [] as LockedConflict[], issues: [snapshot.issue] };

  const parsed: CompositionPlacementIntent[] = [];
  const conflicts: LockedConflict[] = [];
  snapshot.values!.forEach((entry) => {
    const record = inspectKnownRecord(entry, ["assetId", "slotIndex"]);
    if (
      !record
      || typeof record.assetId !== "string"
      || !ASSET_ID_PATTERN.test(record.assetId)
      || !Number.isSafeInteger(record.slotIndex)
    ) {
      conflicts.push(Object.freeze({
        code: "invalid_locked_intent",
        assetId: typeof record?.assetId === "string" && ASSET_ID_PATTERN.test(record.assetId) ? record.assetId : null,
        slotIndex: typeof record?.slotIndex === "number" && Number.isSafeInteger(record.slotIndex) ? record.slotIndex : null,
        slotKey: null,
        message: "Locked intent is malformed.",
      }));
      return;
    }
    parsed.push(Object.freeze({ assetId: record.assetId, slotIndex: record.slotIndex as number }));
  });

  parsed.sort((left, right) => left.slotIndex - right.slotIndex || (left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0));
  const assetCounts = new Map<string, number>();
  const slotCounts = new Map<number, number>();
  parsed.forEach((lock) => {
    assetCounts.set(lock.assetId, (assetCounts.get(lock.assetId) ?? 0) + 1);
    slotCounts.set(lock.slotIndex, (slotCounts.get(lock.slotIndex) ?? 0) + 1);
  });

  for (const [assetId, count] of [...assetCounts].sort(([left], [right]) => left < right ? -1 : 1)) {
    if (count > 1) conflicts.push(Object.freeze({
      code: "duplicate_locked_asset",
      assetId,
      slotIndex: null,
      slotKey: null,
      message: "The same asset is locked more than once.",
    }));
  }
  for (const [slotIndex, count] of [...slotCounts].sort(([left], [right]) => left - right)) {
    if (count > 1) conflicts.push(Object.freeze({
      code: "duplicate_locked_slot",
      assetId: null,
      slotIndex,
      slotKey: variant.slots[slotIndex]?.slotKey ?? null,
      message: "More than one lock occupies the same logical slot.",
    }));
  }

  for (const lock of parsed) {
    const slot = variant.slots[lock.slotIndex];
    const asset = assetMap.get(lock.assetId);
    if (!slot) {
      conflicts.push(Object.freeze({
        code: "locked_slot_out_of_range",
        assetId: lock.assetId,
        slotIndex: lock.slotIndex,
        slotKey: null,
        message: "Locked slot does not exist in this variant.",
      }));
      continue;
    }
    if (!asset) {
      conflicts.push(Object.freeze({
        code: "locked_asset_missing",
        assetId: lock.assetId,
        slotIndex: lock.slotIndex,
        slotKey: slot.slotKey,
        message: "Locked asset is not present in the candidate library.",
      }));
      continue;
    }
    if (!isAssetCompatibleWithSlot(asset, slot)) {
      conflicts.push(Object.freeze({
        code: "locked_orientation_incompatible",
        assetId: lock.assetId,
        slotIndex: lock.slotIndex,
        slotKey: slot.slotKey,
        message: "Locked asset orientation is incompatible with this variant slot.",
      }));
    }
  }

  conflicts.sort((left, right) => (
    left.code < right.code ? -1
      : left.code > right.code ? 1
        : (left.slotIndex ?? -1) - (right.slotIndex ?? -1)
          || ((left.assetId ?? "") < (right.assetId ?? "")
            ? -1
            : (left.assetId ?? "") > (right.assetId ?? "") ? 1 : 0)
  ));
  return { locks: parsed, conflicts, issues: [] as AssignmentInputIssue[] };
}

function assetSlotCosts(
  asset: CompositionAssetCandidate,
  slot: CompositionSlotDefinition,
  squarePenaltyUnits: number,
) {
  const assignmentCostUnits = ratioCostUnits(asset.aspectRatio, slot.assignmentRatio);
  let secondaryProjectionCostUnits = 0;
  let criticalSecondaryProjectionCostUnits = 0;
  for (const presentation of slot.secondaryPresentations) {
    const cost = ratioCostUnits(asset.aspectRatio, presentation.ratio);
    secondaryProjectionCostUnits += cost;
    if (presentation.critical) criticalSecondaryProjectionCostUnits += cost;
  }
  return {
    assignmentCostUnits,
    secondaryProjectionCostUnits,
    criticalSecondaryProjectionCostUnits,
    squarePenaltyUnits: asset.orientation === "square" ? squarePenaltyUnits : 0,
  };
}

function invalidResult(
  variantId: string | null,
  issues: readonly AssignmentInputIssue[],
): CompositionAssignmentResult {
  const sorted = [...issues].sort((left, right) => (
    left.path < right.path ? -1
      : left.path > right.path ? 1
        : left.code < right.code ? -1
          : left.code > right.code ? 1 : 0
  ));
  return Object.freeze({ status: "invalid", variantId, issues: freezeArray(sorted) });
}

/** Assigns one approved variant without I/O, persistence, or production template coupling. */
export function assignComposition(input: CompositionAssignmentInput): CompositionAssignmentResult {
  const root = inspectKnownRecord(input, [
    "variant",
    "assets",
    "existingIntent",
    "locks",
    "squarePenaltyUnits",
  ]);
  if (!root || !Object.prototype.hasOwnProperty.call(root, "variant") || !Object.prototype.hasOwnProperty.call(root, "assets")) {
    return invalidResult(null, [Object.freeze({
      code: "invalid_variant",
      path: "$",
      message: "Assignment input must be a safe record with variant and assets.",
    })]);
  }
  const variantValidation = validateCompositionVariantRegistry({
    templateId: "assignment-contract",
    templateVersion: 1,
    variants: [root.variant],
  });
  if (!variantValidation.ok) {
    return invalidResult(null, [Object.freeze({
      code: "invalid_variant",
      path: "$.variant",
      message: "Variant failed strict contract validation.",
    })]);
  }
  const variant = variantValidation.registry.variants[0];

  const parsedAssets = parseAssets(root.assets);
  const parsedExisting = parseExistingIntent(root.existingIntent, variant.slots.length);
  const squarePenaltyCandidate = root.squarePenaltyUnits ?? DEFAULT_SQUARE_PENALTY_UNITS;
  const policyIssue = Number.isSafeInteger(squarePenaltyCandidate) && (squarePenaltyCandidate as number) >= 1 && (squarePenaltyCandidate as number) <= 1_000_000
    ? []
    : [Object.freeze({
        code: "invalid_square_penalty" as const,
        path: "$.squarePenaltyUnits",
        message: "Square penalty must be a positive safe integer no greater than 1000000.",
      })];
  const inputIssues = [...parsedAssets.issues, ...parsedExisting.issues, ...policyIssue];
  if (inputIssues.length > 0) return invalidResult(variant.variantId, inputIssues);
  const squarePenaltyUnits = squarePenaltyCandidate as number;
  const workload = BigInt(variant.slots.length)
    * BigInt(variant.slots.length)
    * BigInt(parsedAssets.assets.length + variant.slots.length);
  if (workload > BigInt(MAX_ASSIGNMENT_WORK_UNITS)) {
    return invalidResult(variant.variantId, [Object.freeze({
      code: "assignment_workload_exceeded",
      path: "$",
      message: `Assignment workload exceeds ${MAX_ASSIGNMENT_WORK_UNITS} bounded work units.`,
    })]);
  }

  const assetMap = new Map(parsedAssets.assets.map((asset) => [asset.assetId, asset] as const));
  const parsedLocks = parseLocks(root.locks, variant, assetMap);
  if (parsedLocks.issues.length > 0) return invalidResult(variant.variantId, parsedLocks.issues);
  if (parsedLocks.conflicts.length > 0) {
    return Object.freeze({
      status: "blocked",
      variantId: variant.variantId,
      lockedConflicts: freezeArray(parsedLocks.conflicts),
    });
  }

  const existingBySlot = new Map(parsedExisting.intents.map((intent) => [intent.slotIndex, intent.assetId]));
  const lockedBySlot = new Map(parsedLocks.locks.map((lock) => [lock.slotIndex, lock]));
  const usedAssetIds = new Set(parsedLocks.locks.map((lock) => lock.assetId));
  const remainingAssets = parsedAssets.assets.filter((asset) => !usedAssetIds.has(asset.assetId));
  const openSlots = variant.slots.filter((slot) => !lockedBySlot.has(slot.slotIndex));
  const dummyOffset = remainingAssets.length;
  const pairs = minimumLexicographicAssignment(
    openSlots.length,
    remainingAssets.length + openSlots.length,
    (rowIndex, columnIndex) => {
      const slot = openSlots[rowIndex];
      const expectedAssetId = existingBySlot.get(slot.slotIndex);
      if (columnIndex >= dummyOffset) {
        return [0, slot.critical ? 1 : 0, 1, 0, 0, 0, expectedAssetId ? 1 : 0];
      }
      const asset = remainingAssets[columnIndex];
      if (!isAssetCompatibleWithSlot(asset, slot)) return [1, 0, 0, 0, 0, 0, 0];
      const costs = assetSlotCosts(asset, slot, squarePenaltyUnits);
      return [
        0,
        0,
        0,
        costs.criticalSecondaryProjectionCostUnits,
        costs.assignmentCostUnits + costs.secondaryProjectionCostUnits,
        costs.squarePenaltyUnits,
        expectedAssetId && expectedAssetId !== asset.assetId ? 1 : 0,
      ];
    },
  );

  const selectedBySlot = new Map<number, CompositionAssetCandidate>();
  pairs.forEach(([rowIndex, columnIndex]) => {
    if (columnIndex < dummyOffset) {
      const slot = openSlots[rowIndex];
      const asset = remainingAssets[columnIndex];
      if (isAssetCompatibleWithSlot(asset, slot)) selectedBySlot.set(slot.slotIndex, asset);
    }
  });

  const assignments: CompositionSlotAssignment[] = [];
  for (const slot of variant.slots) {
    const lock = lockedBySlot.get(slot.slotIndex);
    const asset = lock ? assetMap.get(lock.assetId)! : selectedBySlot.get(slot.slotIndex);
    if (!asset) {
      assignments.push(Object.freeze({
        slotIndex: slot.slotIndex,
        slotKey: slot.slotKey,
        assetId: null,
        locked: false,
        assignmentCostUnits: 0,
        secondaryProjectionCostUnits: 0,
        criticalSecondaryProjectionCostUnits: 0,
        squarePenaltyUnits: 0,
      }));
      continue;
    }
    const costs = assetSlotCosts(asset, slot, squarePenaltyUnits);
    assignments.push(Object.freeze({
      slotIndex: slot.slotIndex,
      slotKey: slot.slotKey,
      assetId: asset.assetId,
      locked: Boolean(lock),
      ...costs,
    }));
  }

  const placeholderAssignments = assignments.filter((assignment) => assignment.assetId === null);
  const criticalSlotMissing = placeholderAssignments.filter((assignment) => variant.slots[assignment.slotIndex].critical).length;
  const landscapeShortage = placeholderAssignments.filter((assignment) => (
    orientationForCompositionRatio(variant.slots[assignment.slotIndex].assignmentRatio) === "landscape"
  )).length;
  const portraitShortage = placeholderAssignments.length - landscapeShortage;
  const unavoidableLibraryShortage = Math.max(
    0,
    variant.slots.length - parsedAssets.assets.length,
  );
  const orientationShortage = Math.max(
    0,
    placeholderAssignments.length - unavoidableLibraryShortage,
  );
  const squareAssignments = assignments.filter((assignment) => assignment.squarePenaltyUnits > 0);
  const existingIntentChurn = parsedExisting.intents.filter((intent) => (
    assignments[intent.slotIndex]?.assetId !== intent.assetId
  )).length;
  const metrics = Object.freeze({
    criticalSlotMissing,
    placeholderCount: placeholderAssignments.length,
    orientationShortage,
    landscapeShortage,
    portraitShortage,
    criticalSecondaryProjectionCostUnits: assignments.reduce(
      (sum, assignment) => sum + assignment.criticalSecondaryProjectionCostUnits,
      0,
    ),
    totalCropPressureUnits: assignments.reduce(
      (sum, assignment) => sum + assignment.assignmentCostUnits + assignment.secondaryProjectionCostUnits,
      0,
    ),
    squareUseCount: squareAssignments.length,
    squareUsePenaltyUnits: squareAssignments.reduce((sum, assignment) => sum + assignment.squarePenaltyUnits, 0),
    existingIntentChurn,
  });

  const warnings: CompositionAssignmentWarning[] = [];
  if (placeholderAssignments.length > 0) warnings.push(Object.freeze({
    code: "insufficient-compatible-assets",
    slotIndexes: freezeArray(placeholderAssignments.map((assignment) => assignment.slotIndex)),
    message: "One or more slots have no compatible unique asset.",
  }));
  if (squareAssignments.length > 0) warnings.push(Object.freeze({
    code: "square-fallback-used",
    slotIndexes: freezeArray(squareAssignments.map((assignment) => assignment.slotIndex)),
    message: "Square assets were used with the configured deterministic penalty.",
  }));

  return Object.freeze({
    status: "assigned",
    variantId: variant.variantId,
    assignments: freezeArray(assignments),
    metrics,
    warnings: freezeArray(warnings),
  });
}

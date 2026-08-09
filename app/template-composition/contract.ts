export const COMPOSITION_RATIOS = Object.freeze(["3:2", "2:3", "16:9"] as const);

export type CompositionRatio = (typeof COMPOSITION_RATIOS)[number];
export type CompositionOrientation = "landscape" | "portrait" | "square";

export const compositionContractLimits = Object.freeze({
  variants: 64,
  slots: 64,
  secondaryPresentationsPerSlot: 8,
  diagnostics: 256,
  stableIdLength: 64,
  textLength: 1_000,
} as const);

export type SecondaryPresentationRequirement = Readonly<{
  presentationKey: string;
  ratio: CompositionRatio;
  critical: boolean;
}>;

export type CompositionSlotDefinition = Readonly<{
  slotIndex: number;
  slotKey: string;
  logicalRole: string;
  assignmentRatio: CompositionRatio;
  critical: boolean;
  secondaryPresentations: readonly SecondaryPresentationRequirement[];
}>;

export type TemplateCompositionVariant = Readonly<{
  variantId: string;
  slots: readonly CompositionSlotDefinition[];
  fallbackPriority: number;
  label?: string;
  description?: string;
  designIntent?: string;
}>;

export type CompositionVariantRegistry = Readonly<{
  templateId: string;
  templateVersion: number;
  variants: readonly TemplateCompositionVariant[];
}>;

export type VariantStatistics = Readonly<{
  slotCount: number;
  landscapeCount: number;
  portraitCount: number;
  ratioCounts: Readonly<Record<CompositionRatio, number>>;
}>;

export type RegistryValidationErrorCode =
  | "accessor_property"
  | "ambiguous_fallback_priority"
  | "duplicate_presentation_key"
  | "duplicate_slot_key"
  | "duplicate_variant_id"
  | "invalid_array"
  | "invalid_boolean"
  | "invalid_integer"
  | "invalid_ratio"
  | "invalid_record"
  | "invalid_stable_id"
  | "invalid_string"
  | "logical_slot_identity_changed"
  | "missing_field"
  | "oversized_array"
  | "slot_count_changed"
  | "slot_index_not_contiguous"
  | "sparse_array"
  | "symbol_property"
  | "unknown_field"
  | "unsafe_object";

export type RegistryValidationError = Readonly<{
  code: RegistryValidationErrorCode;
  path: string;
  message: string;
}>;

export type RegistryValidationResult =
  | Readonly<{ ok: true; registry: CompositionVariantRegistry }>
  | Readonly<{ ok: false; errors: readonly RegistryValidationError[] }>;

type DataRecord = Record<string, unknown>;

const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ratioSet = new Set<string>(COMPOSITION_RATIOS);

export function isCompositionRatio(value: unknown): value is CompositionRatio {
  return typeof value === "string" && ratioSet.has(value);
}

export function compositionRatioValue(ratio: CompositionRatio) {
  if (ratio === "3:2") return 3 / 2;
  if (ratio === "2:3") return 2 / 3;
  return 16 / 9;
}

export function orientationForCompositionRatio(
  ratio: CompositionRatio,
): Exclude<CompositionOrientation, "square"> {
  return compositionRatioValue(ratio) < 1 ? "portrait" : "landscape";
}

export function deriveVariantStatistics(variant: TemplateCompositionVariant): VariantStatistics {
  const ratioCounts: Record<CompositionRatio, number> = { "3:2": 0, "2:3": 0, "16:9": 0 };
  let landscapeCount = 0;
  let portraitCount = 0;

  for (const slot of variant.slots) {
    ratioCounts[slot.assignmentRatio] += 1;
    if (orientationForCompositionRatio(slot.assignmentRatio) === "landscape") landscapeCount += 1;
    else portraitCount += 1;
  }

  return Object.freeze({
    slotCount: variant.slots.length,
    landscapeCount,
    portraitCount,
    ratioCounts: Object.freeze(ratioCounts),
  });
}

function childPath(path: string, key: string) {
  return STABLE_ID_PATTERN.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function addError(
  errors: RegistryValidationError[],
  code: RegistryValidationErrorCode,
  path: string,
  message: string,
) {
  if (errors.length >= compositionContractLimits.diagnostics) return;
  errors.push(Object.freeze({ code, path, message }));
}

function inspectRecord(
  value: unknown,
  path: string,
  allowedFields: readonly string[],
  errors: RegistryValidationError[],
): DataRecord | null {
  if (value === null || typeof value !== "object") {
    addError(errors, "invalid_record", path, "Expected a plain record.");
    return null;
  }

  try {
    if (Array.isArray(value)) {
      addError(errors, "invalid_record", path, "Expected a plain record.");
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      addError(errors, "invalid_record", path, "Expected a plain or null-prototype record.");
      return null;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const symbolKeys = Object.getOwnPropertySymbols(value);
    if (symbolKeys.length > 0) {
      addError(errors, "symbol_property", path, "Symbol properties are not allowed.");
    }

    const allowed = new Set(allowedFields);
    for (const key of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor)) {
        addError(errors, "accessor_property", childPath(path, key), "Accessor properties are not allowed.");
        continue;
      }
      if (!allowed.has(key)) {
        addError(errors, "unknown_field", childPath(path, key), "Unknown field.");
      }
    }

    return Object.fromEntries(
      Object.entries(descriptors)
        .filter(([, descriptor]) => "value" in descriptor)
        .map(([key, descriptor]) => [key, (descriptor as PropertyDescriptor & { value: unknown }).value]),
    );
  } catch {
    addError(errors, "unsafe_object", path, "The record could not be inspected safely.");
    return null;
  }
}

function requiredField(
  record: DataRecord,
  key: string,
  path: string,
  errors: RegistryValidationError[],
) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    addError(errors, "missing_field", childPath(path, key), "Required field is missing.");
    return undefined;
  }
  return record[key];
}

function inspectArray(
  value: unknown,
  path: string,
  maximum: number,
  errors: RegistryValidationError[],
): readonly unknown[] | null {
  try {
    if (!Array.isArray(value)) {
      addError(errors, "invalid_array", path, "Expected an array.");
      return null;
    }
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      addError(errors, "invalid_array", path, "Expected an array with the standard Array prototype.");
      return null;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const symbolKeys = Object.getOwnPropertySymbols(value);
    if (symbolKeys.length > 0) {
      addError(errors, "symbol_property", path, "Symbol properties are not allowed on arrays.");
      return null;
    }
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
      addError(errors, "invalid_array", path, "Array length could not be inspected safely.");
      return null;
    }
    const length = lengthDescriptor.value as number;
    if (length > maximum) {
      addError(errors, "oversized_array", path, `Array exceeds the maximum length of ${maximum}.`);
      return null;
    }

    const snapshot: unknown[] = [];
    for (const key of Object.keys(descriptors).sort()) {
      if (key === "length") continue;
      if (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) {
        addError(errors, "unknown_field", childPath(path, key), "Unknown array property.");
        continue;
      }
      if (!("value" in descriptors[key])) {
        addError(errors, "accessor_property", `${path}[${key}]`, "Array accessors are not allowed.");
      }
    }
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor) {
        addError(errors, "sparse_array", `${path}[${index}]`, "Sparse arrays are not allowed.");
        return null;
      }
      if (!("value" in descriptor)) {
        addError(errors, "accessor_property", `${path}[${index}]`, "Array accessors are not allowed.");
        return null;
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    addError(errors, "unsafe_object", path, "The array could not be inspected safely.");
    return null;
  }
}

function parseStableId(
  value: unknown,
  path: string,
  errors: RegistryValidationError[],
) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > compositionContractLimits.stableIdLength
    || !STABLE_ID_PATTERN.test(value)
  ) {
    addError(errors, "invalid_stable_id", path, "Expected a canonical lowercase ASCII identifier.");
    return null;
  }
  return value;
}

function parseOptionalText(
  record: DataRecord,
  key: string,
  path: string,
  errors: RegistryValidationError[],
) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== "string" || value.length > compositionContractLimits.textLength) {
    addError(errors, "invalid_string", childPath(path, key), "Expected a bounded string.");
    return null;
  }
  return value;
}

function parseInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  errors: RegistryValidationError[],
) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    addError(errors, "invalid_integer", path, `Expected a safe integer from ${minimum} to ${maximum}.`);
    return null;
  }
  return value as number;
}

function parseBoolean(value: unknown, path: string, errors: RegistryValidationError[]) {
  if (typeof value !== "boolean") {
    addError(errors, "invalid_boolean", path, "Expected a boolean.");
    return null;
  }
  return value;
}

function parseRatio(value: unknown, path: string, errors: RegistryValidationError[]) {
  if (!isCompositionRatio(value)) {
    addError(errors, "invalid_ratio", path, "Expected one of 3:2, 2:3, or 16:9.");
    return null;
  }
  return value;
}

function parseSecondaryPresentations(
  value: unknown,
  path: string,
  errors: RegistryValidationError[],
): readonly SecondaryPresentationRequirement[] | null {
  if (value === undefined) return Object.freeze([]);
  const input = inspectArray(
    value,
    path,
    compositionContractLimits.secondaryPresentationsPerSlot,
    errors,
  );
  if (!input) return null;

  const presentations: SecondaryPresentationRequirement[] = [];
  const keys = new Set<string>();
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = inspectRecord(entry, entryPath, ["presentationKey", "ratio", "critical"], errors);
    if (!record) return;
    const presentationKey = parseStableId(
      requiredField(record, "presentationKey", entryPath, errors),
      `${entryPath}.presentationKey`,
      errors,
    );
    const ratio = parseRatio(
      requiredField(record, "ratio", entryPath, errors),
      `${entryPath}.ratio`,
      errors,
    );
    const critical = parseBoolean(
      requiredField(record, "critical", entryPath, errors),
      `${entryPath}.critical`,
      errors,
    );
    if (!presentationKey || !ratio || critical === null) return;
    if (keys.has(presentationKey)) {
      addError(errors, "duplicate_presentation_key", `${entryPath}.presentationKey`, "Presentation key is duplicated in the slot.");
      return;
    }
    keys.add(presentationKey);
    presentations.push(Object.freeze({ presentationKey, ratio, critical }));
  });
  return Object.freeze(presentations);
}

function parseSlot(
  value: unknown,
  path: string,
  expectedIndex: number,
  errors: RegistryValidationError[],
): CompositionSlotDefinition | null {
  const record = inspectRecord(value, path, [
    "slotIndex",
    "slotKey",
    "logicalRole",
    "assignmentRatio",
    "critical",
    "secondaryPresentations",
  ], errors);
  if (!record) return null;

  const slotIndex = parseInteger(
    requiredField(record, "slotIndex", path, errors),
    `${path}.slotIndex`,
    0,
    compositionContractLimits.slots - 1,
    errors,
  );
  if (slotIndex !== null && slotIndex !== expectedIndex) {
    addError(errors, "slot_index_not_contiguous", `${path}.slotIndex`, "Slot index must equal its zero-based array position.");
  }
  const slotKey = parseStableId(
    requiredField(record, "slotKey", path, errors),
    `${path}.slotKey`,
    errors,
  );
  const logicalRole = parseStableId(
    requiredField(record, "logicalRole", path, errors),
    `${path}.logicalRole`,
    errors,
  );
  const assignmentRatio = parseRatio(
    requiredField(record, "assignmentRatio", path, errors),
    `${path}.assignmentRatio`,
    errors,
  );
  const critical = parseBoolean(
    requiredField(record, "critical", path, errors),
    `${path}.critical`,
    errors,
  );
  const secondaryPresentations = parseSecondaryPresentations(
    record.secondaryPresentations,
    `${path}.secondaryPresentations`,
    errors,
  );

  if (
    slotIndex === null
    || slotIndex !== expectedIndex
    || !slotKey
    || !logicalRole
    || !assignmentRatio
    || critical === null
    || !secondaryPresentations
  ) return null;

  return Object.freeze({
    slotIndex,
    slotKey,
    logicalRole,
    assignmentRatio,
    critical,
    secondaryPresentations,
  });
}

function parseVariant(
  value: unknown,
  path: string,
  errors: RegistryValidationError[],
): TemplateCompositionVariant | null {
  const record = inspectRecord(value, path, [
    "variantId",
    "slots",
    "fallbackPriority",
    "label",
    "description",
    "designIntent",
  ], errors);
  if (!record) return null;

  const variantId = parseStableId(
    requiredField(record, "variantId", path, errors),
    `${path}.variantId`,
    errors,
  );
  const fallbackPriority = parseInteger(
    requiredField(record, "fallbackPriority", path, errors),
    `${path}.fallbackPriority`,
    0,
    1_000_000,
    errors,
  );
  const inputSlots = inspectArray(
    requiredField(record, "slots", path, errors),
    `${path}.slots`,
    compositionContractLimits.slots,
    errors,
  );
  if (inputSlots && inputSlots.length === 0) {
    addError(errors, "invalid_array", `${path}.slots`, "A variant must define at least one slot.");
  }

  const slots = inputSlots?.map((slot, index) => parseSlot(slot, `${path}.slots[${index}]`, index, errors)) ?? [];
  const slotKeys = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    if (!slot) continue;
    if (slotKeys.has(slot.slotKey)) {
      addError(errors, "duplicate_slot_key", `${path}.slots[${index}].slotKey`, "Slot key is duplicated in the variant.");
    }
    slotKeys.add(slot.slotKey);
  }

  const label = parseOptionalText(record, "label", path, errors);
  const description = parseOptionalText(record, "description", path, errors);
  const designIntent = parseOptionalText(record, "designIntent", path, errors);
  if (
    !variantId
    || fallbackPriority === null
    || !inputSlots
    || inputSlots.length === 0
    || slots.some((slot) => slot === null)
    || label === null
    || description === null
    || designIntent === null
  ) return null;

  return Object.freeze({
    variantId,
    slots: Object.freeze(slots as CompositionSlotDefinition[]),
    fallbackPriority,
    ...(label !== undefined ? { label } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(designIntent !== undefined ? { designIntent } : {}),
  });
}

function sortedErrors(errors: readonly RegistryValidationError[]) {
  return Object.freeze([...errors].sort((left, right) => {
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    if (left.code < right.code) return -1;
    if (left.code > right.code) return 1;
    return left.message < right.message ? -1 : left.message > right.message ? 1 : 0;
  }));
}

/** Strictly validates untrusted design registry data without mutating or aliasing it. */
export function validateCompositionVariantRegistry(value: unknown): RegistryValidationResult {
  const errors: RegistryValidationError[] = [];
  const root = inspectRecord(value, "$", ["templateId", "templateVersion", "variants"], errors);
  if (!root) return Object.freeze({ ok: false, errors: sortedErrors(errors) });

  const templateId = parseStableId(
    requiredField(root, "templateId", "$", errors),
    "$.templateId",
    errors,
  );
  const templateVersion = parseInteger(
    requiredField(root, "templateVersion", "$", errors),
    "$.templateVersion",
    1,
    1_000_000,
    errors,
  );
  const inputVariants = inspectArray(
    requiredField(root, "variants", "$", errors),
    "$.variants",
    compositionContractLimits.variants,
    errors,
  );
  if (inputVariants && inputVariants.length === 0) {
    addError(errors, "invalid_array", "$.variants", "A registry must define at least one variant.");
  }

  const variants = inputVariants?.map((variant, index) => parseVariant(
    variant,
    `$.variants[${index}]`,
    errors,
  )) ?? [];

  const variantIds = new Map<string, number>();
  const priorities = new Map<number, number>();
  variants.forEach((variant, index) => {
    if (!variant) return;
    const duplicateVariant = variantIds.get(variant.variantId);
    if (duplicateVariant !== undefined) {
      addError(errors, "duplicate_variant_id", `$.variants[${index}].variantId`, `Variant ID duplicates index ${duplicateVariant}.`);
    } else variantIds.set(variant.variantId, index);

    const duplicatePriority = priorities.get(variant.fallbackPriority);
    if (duplicatePriority !== undefined) {
      addError(errors, "ambiguous_fallback_priority", `$.variants[${index}].fallbackPriority`, `Fallback priority duplicates index ${duplicatePriority}.`);
    } else priorities.set(variant.fallbackPriority, index);
  });

  const completeVariants = variants.filter((variant): variant is TemplateCompositionVariant => variant !== null);
  const identityBaseline = [...completeVariants].sort((left, right) => (
    left.fallbackPriority - right.fallbackPriority
    || (left.variantId < right.variantId ? -1 : left.variantId > right.variantId ? 1 : 0)
  ))[0];

  if (identityBaseline) {
    completeVariants.forEach((variant) => {
      const inputIndex = variants.indexOf(variant);
      if (variant.slots.length !== identityBaseline.slots.length) {
        addError(errors, "slot_count_changed", `$.variants[${inputIndex}].slots`, "All variants in a template version must keep the same slot count.");
        return;
      }
      variant.slots.forEach((slot, slotIndex) => {
        const baselineSlot = identityBaseline.slots[slotIndex];
        if (
          slot.slotKey !== baselineSlot.slotKey
          || slot.logicalRole !== baselineSlot.logicalRole
          || slot.critical !== baselineSlot.critical
        ) {
          addError(
            errors,
            "logical_slot_identity_changed",
            `$.variants[${inputIndex}].slots[${slotIndex}]`,
            "A same-version variant cannot change slot key, logical role, or critical identity.",
          );
        }
      });
    });
  }

  if (
    errors.length > 0
    || !templateId
    || templateVersion === null
    || !inputVariants
    || inputVariants.length === 0
    || completeVariants.length !== inputVariants.length
  ) {
    return Object.freeze({ ok: false, errors: sortedErrors(errors) });
  }

  return Object.freeze({
    ok: true,
    registry: Object.freeze({
      templateId,
      templateVersion,
      variants: Object.freeze(completeVariants),
    }),
  });
}

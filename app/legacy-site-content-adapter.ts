import {
  isSiteDocumentV1TemplateId,
  parseSiteDocumentV1,
  SITE_DOCUMENT_SCHEMA_VERSION,
  SITE_DOCUMENT_V1_TEMPLATE_IDS,
  type SiteDocumentV1,
  type SiteDocumentV1TemplateId,
  type SlotComposition,
} from "./site-document";

const TEMPLATE_VERSION = 1 as const;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STABLE_DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;
const LEGACY_ASSET_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const MAX_DIAGNOSTIC_CODE_LENGTH = 80;

export const LEGACY_SITE_CONTENT_TEMPLATE_SPECS = Object.freeze({
  "cinematic-light": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 9 }),
  "neon-hud": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 9 }),
  "film-rail": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 9 }),
  "manga-panels": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 9 }),
  "prism-liquid": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 9 }),
  "orbital-portal": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 8 }),
  "archive-os": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 12 }),
  "editorial-duet": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 9 }),
  "polaroid-field": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 9 }),
  "character-select": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 9 }),
  "museum-depth": Object.freeze({ templateVersion: TEMPLATE_VERSION, slotCount: 7 }),
} satisfies Record<SiteDocumentV1TemplateId, Readonly<{
  templateVersion: typeof TEMPLATE_VERSION;
  slotCount: number;
}>>);

export type LegacyCompositionMode = "explicit" | "fallback";

export type LegacyWorkSource = Readonly<{
  collection: "works" | "templateWorks";
  workIndex: number;
}>;

export type LegacySlotResolution = Readonly<{
  source: LegacyWorkSource;
  slotIndex: number;
  resolution:
    | Readonly<{ status: "resolved"; assetId: string }>
    | Readonly<{ status: "unresolved"; reason: string }>;
}>;

export type LegacyTemplateAssetSnapshot = Readonly<{
  templateId: SiteDocumentV1TemplateId;
  templateVersion: typeof TEMPLATE_VERSION;
  mode: LegacyCompositionMode;
  slots: readonly LegacySlotResolution[];
}>;

export type LegacySiteContentAssetSnapshot = Readonly<{
  siteId: string;
  templates: readonly LegacyTemplateAssetSnapshot[];
}>;

export type LegacySiteContentAdapterWarningCode =
  | "unsupported_theme"
  | "dropped_work_code"
  | "dropped_full_width";

export type LegacySiteContentAdapterErrorCode =
  | "invalid_legacy_root"
  | "missing_field"
  | "unknown_field"
  | "invalid_type"
  | "invalid_value"
  | "limit_exceeded"
  | "unknown_template"
  | "invalid_snapshot_root"
  | "invalid_site_id"
  | "missing_snapshot_template"
  | "duplicate_snapshot_template"
  | "invalid_template_version"
  | "snapshot_mode_mismatch"
  | "invalid_source"
  | "duplicate_source"
  | "duplicate_slot"
  | "slot_out_of_range"
  | "invalid_asset_id"
  | "snapshot_conflict"
  | "unsupported_social_qr_asset"
  | "site_document_invalid";

export type LegacySiteContentAdapterError = Readonly<{
  code: LegacySiteContentAdapterErrorCode;
  path: string;
  message: string;
}>;

export type LegacySiteContentAdapterUnresolved = Readonly<{
  code: string;
  path: string;
  source: LegacyWorkSource;
  templateId: SiteDocumentV1TemplateId;
  slotIndex: number;
  message: string;
}>;

export type LegacySiteContentAdapterWarning = Readonly<{
  code: LegacySiteContentAdapterWarningCode;
  paths: readonly string[];
  count: number;
  message: string;
}>;

type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type LegacySiteContentAdapterResult =
  | Readonly<{
      status: "ready";
      document: SiteDocumentV1;
      warnings: readonly LegacySiteContentAdapterWarning[];
      unresolved: readonly [];
      errors: readonly [];
    }>
  | Readonly<{
      status: "blocked-by-unresolved";
      documentPreview: SiteDocumentV1;
      warnings: readonly LegacySiteContentAdapterWarning[];
      unresolved: NonEmptyReadonlyArray<LegacySiteContentAdapterUnresolved>;
      errors: readonly [];
    }>
  | Readonly<{
      status: "invalid";
      document: null;
      warnings: readonly LegacySiteContentAdapterWarning[];
      unresolved: readonly LegacySiteContentAdapterUnresolved[];
      errors: NonEmptyReadonlyArray<LegacySiteContentAdapterError>;
    }>;

type JsonRecord = Record<string, unknown>;

type LegacyWork = {
  assetId?: string;
  slotIndex?: number;
  locked?: boolean;
  code: string;
  title: string;
  subtitle: string;
  image: string;
  preview: string;
  position: string;
  focus: { x: number; y: number };
  previewWidth: number;
  previewHeight: number;
  fullWidth: number;
  enabled: boolean;
};

type ParsedLegacySiteContent = Omit<SiteDocumentV1, "schemaVersion" | "compositions"> & {
  works: LegacyWork[];
  templateWorks: Partial<Record<SiteDocumentV1TemplateId, LegacyWork[]>>;
  explicitTemplates: ReadonlySet<SiteDocumentV1TemplateId>;
};

type ParsedTemplateSnapshot = {
  templateId: SiteDocumentV1TemplateId;
  templateVersion: typeof TEMPLATE_VERSION;
  mode: LegacyCompositionMode;
  slots: Array<{
    source: LegacyWorkSource;
    slotIndex: number;
    resolution:
      | { status: "resolved"; assetId: string }
      | { status: "unresolved"; reason: string };
    work: LegacyWork;
  }>;
};

const ROOT_FIELDS = [
  "activeTemplate",
  "profile",
  "hero",
  "trustItems",
  "works",
  "templateWorks",
  "packages",
  "contact",
  "social",
  "bookingFields",
  "statement",
  "theme",
] as const;

const WORK_FIELDS = [
  "assetId",
  "slotIndex",
  "locked",
  "code",
  "title",
  "subtitle",
  "image",
  "preview",
  "position",
  "previewWidth",
  "previewHeight",
  "fullWidth",
  "enabled",
] as const;

const WARNING_MESSAGES: Record<LegacySiteContentAdapterWarningCode, string> = {
  unsupported_theme: "Legacy theme overrides are unsupported by SiteDocumentV1 and were omitted.",
  dropped_work_code: "Legacy work display codes have no SiteDocumentV1 slot field and were omitted.",
  dropped_full_width: "Legacy full-width render metadata has no SiteDocumentV1 slot field and was omitted.",
};

function isJsonRecord(value: unknown): value is JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: JsonRecord, field: string) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function fieldPath(parent: string, field: string) {
  return `${parent}.${field}`;
}

function itemPath(parent: string, index: number) {
  return `${parent}[${index}]`;
}

function addError(
  errors: LegacySiteContentAdapterError[],
  code: LegacySiteContentAdapterErrorCode,
  path: string,
  message: string,
) {
  errors.push({ code, path, message });
}

function rejectUnknownFields(
  value: JsonRecord,
  allowedFields: readonly string[],
  path: string,
  errors: LegacySiteContentAdapterError[],
) {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      addError(errors, "unknown_field", fieldPath(path, field), `Unknown field: ${field}.`);
    }
  }
}

function requiredRecord(
  parent: JsonRecord,
  field: string,
  parentPath: string,
  errors: LegacySiteContentAdapterError[],
): JsonRecord | null {
  const path = fieldPath(parentPath, field);
  if (!hasOwn(parent, field)) {
    addError(errors, "missing_field", path, "Required field is missing.");
    return null;
  }
  if (!isJsonRecord(parent[field])) {
    addError(errors, "invalid_type", path, "Expected an object.");
    return null;
  }
  return parent[field];
}

function requiredArray(
  parent: JsonRecord,
  field: string,
  parentPath: string,
  errors: LegacySiteContentAdapterError[],
  maximumLength: number,
): unknown[] {
  const path = fieldPath(parentPath, field);
  if (!hasOwn(parent, field)) {
    addError(errors, "missing_field", path, "Required field is missing.");
    return [];
  }
  const value = parent[field];
  if (!Array.isArray(value)) {
    addError(errors, "invalid_type", path, "Expected an array.");
    return [];
  }
  if (value.length > maximumLength) {
    addError(errors, "limit_exceeded", path, `Array exceeds ${maximumLength} items.`);
  }
  return value;
}

function requiredString(
  parent: JsonRecord,
  field: string,
  parentPath: string,
  errors: LegacySiteContentAdapterError[],
  maximumLength = 2_048,
) {
  const path = fieldPath(parentPath, field);
  if (!hasOwn(parent, field)) {
    addError(errors, "missing_field", path, "Required field is missing.");
    return "";
  }
  const value = parent[field];
  if (typeof value !== "string") {
    addError(errors, "invalid_type", path, "Expected a string.");
    return "";
  }
  if (value.length > maximumLength) {
    addError(errors, "limit_exceeded", path, `String exceeds ${maximumLength} characters.`);
  }
  return value;
}

function requiredBoolean(
  parent: JsonRecord,
  field: string,
  parentPath: string,
  errors: LegacySiteContentAdapterError[],
) {
  const path = fieldPath(parentPath, field);
  if (!hasOwn(parent, field)) {
    addError(errors, "missing_field", path, "Required field is missing.");
    return false;
  }
  const value = parent[field];
  if (typeof value !== "boolean") {
    addError(errors, "invalid_type", path, "Expected a boolean.");
    return false;
  }
  return value;
}

function requiredDimension(
  parent: JsonRecord,
  field: string,
  parentPath: string,
  errors: LegacySiteContentAdapterError[],
) {
  const path = fieldPath(parentPath, field);
  if (!hasOwn(parent, field)) {
    addError(errors, "missing_field", path, "Required field is missing.");
    return 1;
  }
  const value = parent[field];
  if (typeof value !== "number") {
    addError(errors, "invalid_type", path, "Expected a number.");
    return 1;
  }
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000) {
    addError(errors, "invalid_value", path, "Expected an integer dimension from 1 to 100000.");
    return 1;
  }
  return value;
}

function parseStringObject<T extends JsonRecord>(
  parent: JsonRecord,
  field: string,
  parentPath: string,
  fields: readonly string[],
  errors: LegacySiteContentAdapterError[],
) {
  const path = fieldPath(parentPath, field);
  const value = requiredRecord(parent, field, parentPath, errors);
  if (!value) return Object.fromEntries(fields.map((key) => [key, ""])) as T;
  rejectUnknownFields(value, fields, path, errors);
  return Object.fromEntries(fields.map((key) => [
    key,
    requiredString(value, key, path, errors),
  ])) as T;
}

function parseFocus(
  position: string,
  path: string,
  errors: LegacySiteContentAdapterError[],
) {
  const match = position.trim().match(/^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/u);
  if (!match) {
    addError(errors, "invalid_value", path, "Expected two percentage coordinates from 0% to 100%.");
    return { x: 50, y: 50 };
  }
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    addError(errors, "invalid_value", path, "Focus coordinates must both be from 0% to 100%.");
    return { x: 50, y: 50 };
  }
  return { x, y };
}

function addWarningPath(
  warningPaths: Map<LegacySiteContentAdapterWarningCode, Set<string>>,
  code: LegacySiteContentAdapterWarningCode,
  path: string,
) {
  const paths = warningPaths.get(code) ?? new Set<string>();
  paths.add(path);
  warningPaths.set(code, paths);
}

function parseWork(
  value: unknown,
  path: string,
  slotLimit: number,
  errors: LegacySiteContentAdapterError[],
  warningPaths: Map<LegacySiteContentAdapterWarningCode, Set<string>>,
): LegacyWork {
  if (!isJsonRecord(value)) {
    addError(errors, "invalid_type", path, "Expected a legacy work object.");
    return {
      code: "",
      title: "",
      subtitle: "",
      image: "",
      preview: "",
      position: "50% 50%",
      focus: { x: 50, y: 50 },
      previewWidth: 1,
      previewHeight: 1,
      fullWidth: 1,
      enabled: false,
    };
  }

  rejectUnknownFields(value, WORK_FIELDS, path, errors);
  if (hasOwn(value, "code")) addWarningPath(warningPaths, "dropped_work_code", fieldPath(path, "code"));
  if (hasOwn(value, "fullWidth")) {
    addWarningPath(warningPaths, "dropped_full_width", fieldPath(path, "fullWidth"));
  }

  const code = requiredString(value, "code", path, errors, 80);
  const title = requiredString(value, "title", path, errors, 240);
  const subtitle = requiredString(value, "subtitle", path, errors, 500);
  const image = requiredString(value, "image", path, errors);
  const preview = requiredString(value, "preview", path, errors);
  const position = requiredString(value, "position", path, errors, 100);
  const previewWidth = requiredDimension(value, "previewWidth", path, errors);
  const previewHeight = requiredDimension(value, "previewHeight", path, errors);
  const fullWidth = requiredDimension(value, "fullWidth", path, errors);
  const enabled = requiredBoolean(value, "enabled", path, errors);
  const work: LegacyWork = {
    code,
    title,
    subtitle,
    image,
    preview,
    position,
    focus: parseFocus(position, fieldPath(path, "position"), errors),
    previewWidth,
    previewHeight,
    fullWidth,
    enabled,
  };

  if (hasOwn(value, "assetId")) {
    if (typeof value.assetId !== "string") {
      addError(errors, "invalid_type", fieldPath(path, "assetId"), "Expected a string.");
    } else if (!LEGACY_ASSET_REFERENCE_PATTERN.test(value.assetId)) {
      addError(
        errors,
        "invalid_value",
        fieldPath(path, "assetId"),
        "Expected a legacy asset reference containing only letters, digits, underscores, or hyphens.",
      );
    } else {
      work.assetId = value.assetId;
    }
  }
  if (hasOwn(value, "slotIndex")) {
    const slotIndex = value.slotIndex;
    if (
      typeof slotIndex !== "number"
      || !Number.isSafeInteger(slotIndex)
      || slotIndex < 0
      || slotIndex >= slotLimit
    ) {
      addError(
        errors,
        "invalid_value",
        fieldPath(path, "slotIndex"),
        `Expected a slot index from 0 to ${slotLimit - 1}.`,
      );
    } else {
      work.slotIndex = slotIndex;
    }
  }
  if (hasOwn(value, "locked")) {
    if (typeof value.locked !== "boolean") {
      addError(errors, "invalid_type", fieldPath(path, "locked"), "Expected a boolean.");
    } else {
      work.locked = value.locked;
    }
  }
  return work;
}

function parseWorkArray(
  values: unknown[],
  path: string,
  slotLimit: number,
  errors: LegacySiteContentAdapterError[],
  warningPaths: Map<LegacySiteContentAdapterWarningCode, Set<string>>,
) {
  const works = values.map((value, index) => parseWork(
    value,
    itemPath(path, index),
    slotLimit,
    errors,
    warningPaths,
  ));
  const slotIndexes = new Map<number, number>();
  works.forEach((work, index) => {
    if (!work.enabled) return;
    if (work.slotIndex !== undefined) {
      const previous = slotIndexes.get(work.slotIndex);
      if (previous !== undefined) {
        addError(
          errors,
          "invalid_value",
          fieldPath(itemPath(path, index), "slotIndex"),
          `Duplicate legacy slot index also used at ${itemPath(path, previous)}.`,
        );
      } else {
        slotIndexes.set(work.slotIndex, index);
      }
    }
  });
  return works;
}

function parseLegacySiteContent(
  value: unknown,
  errors: LegacySiteContentAdapterError[],
  warningPaths: Map<LegacySiteContentAdapterWarningCode, Set<string>>,
): ParsedLegacySiteContent | null {
  if (!isJsonRecord(value)) {
    addError(errors, "invalid_legacy_root", "$", "Expected a raw legacy SiteContent object.");
    return null;
  }
  rejectUnknownFields(value, ROOT_FIELDS, "$", errors);
  if (hasOwn(value, "theme")) addWarningPath(warningPaths, "unsupported_theme", "$.theme");

  let activeTemplate: SiteDocumentV1TemplateId = SITE_DOCUMENT_V1_TEMPLATE_IDS[0];
  if (!hasOwn(value, "activeTemplate")) {
    addError(errors, "missing_field", "$.activeTemplate", "Required field is missing.");
  } else if (typeof value.activeTemplate !== "string") {
    addError(errors, "invalid_type", "$.activeTemplate", "Expected a template ID string.");
  } else if (!isSiteDocumentV1TemplateId(value.activeTemplate)) {
    addError(errors, "unknown_template", "$.activeTemplate", `Unknown template: ${value.activeTemplate}.`);
  } else {
    activeTemplate = value.activeTemplate;
  }

  const profile = parseStringObject<SiteDocumentV1["profile"] & JsonRecord>(
    value,
    "profile",
    "$",
    ["brand", "mark", "photographer", "role", "city", "availability", "intro"],
    errors,
  );
  const hero = parseStringObject<SiteDocumentV1["hero"] & JsonRecord>(
    value,
    "hero",
    "$",
    ["eyebrow", "title", "services"],
    errors,
  );
  const contact = parseStringObject<SiteDocumentV1["contact"] & JsonRecord>(
    value,
    "contact",
    "$",
    ["wechat", "email", "note"],
    errors,
  );
  const statement = parseStringObject<SiteDocumentV1["statement"] & JsonRecord>(
    value,
    "statement",
    "$",
    ["eyebrow", "lineOne", "lineTwo"],
    errors,
  );

  const trustItems = requiredArray(value, "trustItems", "$", errors, 8).map((item, index) => {
    const path = itemPath("$.trustItems", index);
    if (!isJsonRecord(item)) {
      addError(errors, "invalid_type", path, "Expected an object.");
      return { label: "", value: "" };
    }
    rejectUnknownFields(item, ["label", "value"], path, errors);
    return {
      label: requiredString(item, "label", path, errors),
      value: requiredString(item, "value", path, errors),
    };
  });

  const packages = requiredArray(value, "packages", "$", errors, 12).map((item, index) => {
    const path = itemPath("$.packages", index);
    if (!isJsonRecord(item)) {
      addError(errors, "invalid_type", path, "Expected an object.");
      return {
        number: "",
        english: "",
        name: "",
        description: "",
        price: "",
        duration: "",
        deliverables: [],
        enabled: false,
      };
    }
    rejectUnknownFields(item, [
      "number",
      "english",
      "name",
      "description",
      "price",
      "duration",
      "deliverables",
      "enabled",
    ], path, errors);
    return {
      number: requiredString(item, "number", path, errors),
      english: requiredString(item, "english", path, errors),
      name: requiredString(item, "name", path, errors),
      description: requiredString(item, "description", path, errors),
      price: requiredString(item, "price", path, errors),
      duration: requiredString(item, "duration", path, errors),
      deliverables: requiredArray(item, "deliverables", path, errors, 12).map(
        (entry, deliverableIndex) => {
          const entryPath = itemPath(fieldPath(path, "deliverables"), deliverableIndex);
          if (typeof entry !== "string") {
            addError(errors, "invalid_type", entryPath, "Expected a string.");
            return "";
          }
          if (entry.length > 2_048) {
            addError(errors, "limit_exceeded", entryPath, "String exceeds 2048 characters.");
          }
          return entry;
        },
      ),
      enabled: requiredBoolean(item, "enabled", path, errors),
    };
  });

  const social = requiredArray(value, "social", "$", errors, 8).map((item, index) => {
    const path = itemPath("$.social", index);
    if (!isJsonRecord(item)) {
      addError(errors, "invalid_type", path, "Expected an object.");
      return { label: "", handle: "" };
    }
    rejectUnknownFields(item, ["label", "handle", "qrAssetId"], path, errors);
    if (hasOwn(item, "qrAssetId")) {
      addError(
        errors,
        "unsupported_social_qr_asset",
        fieldPath(path, "qrAssetId"),
        "Local platform QR assets require a future SiteDocument and AssetResolver decision.",
      );
    }
    return {
      label: requiredString(item, "label", path, errors),
      handle: requiredString(item, "handle", path, errors),
    };
  });

  const bookingFields = requiredArray(value, "bookingFields", "$", errors, 30).map(
    (entry, index) => {
      const path = itemPath("$.bookingFields", index);
      if (typeof entry !== "string") {
        addError(errors, "invalid_type", path, "Expected a string.");
        return "";
      }
      if (entry.length > 2_048) {
        addError(errors, "limit_exceeded", path, "String exceeds 2048 characters.");
      }
      return entry;
    },
  );

  const works = parseWorkArray(
    requiredArray(value, "works", "$", errors, 40),
    "$.works",
    40,
    errors,
    warningPaths,
  );

  const templateWorksValue = requiredRecord(value, "templateWorks", "$", errors);
  const templateWorks: Partial<Record<SiteDocumentV1TemplateId, LegacyWork[]>> = {};
  const explicitTemplates = new Set<SiteDocumentV1TemplateId>();
  if (templateWorksValue) {
    for (const [templateId, rawWorks] of Object.entries(templateWorksValue)) {
      const path = fieldPath("$.templateWorks", templateId);
      if (!isSiteDocumentV1TemplateId(templateId)) {
        addError(errors, "unknown_template", path, `Unknown template: ${templateId}.`);
        continue;
      }
      explicitTemplates.add(templateId);
      if (!Array.isArray(rawWorks)) {
        addError(errors, "invalid_type", path, "Expected an array.");
        templateWorks[templateId] = [];
        continue;
      }
      const slotCount = LEGACY_SITE_CONTENT_TEMPLATE_SPECS[templateId].slotCount;
      if (rawWorks.length > slotCount) {
        addError(errors, "limit_exceeded", path, `Array exceeds ${slotCount} template slots.`);
      }
      templateWorks[templateId] = parseWorkArray(
        rawWorks,
        path,
        slotCount,
        errors,
        warningPaths,
      );
    }
  }

  return {
    activeTemplate,
    profile,
    hero,
    trustItems,
    packages,
    contact,
    social,
    bookingFields,
    statement,
    works,
    templateWorks,
    explicitTemplates,
  };
}

function validateSnapshot(
  snapshot: LegacySiteContentAssetSnapshot,
  legacy: ParsedLegacySiteContent | null,
  errors: LegacySiteContentAdapterError[],
  unresolved: LegacySiteContentAdapterUnresolved[],
): Map<SiteDocumentV1TemplateId, ParsedTemplateSnapshot> {
  const parsed = new Map<SiteDocumentV1TemplateId, ParsedTemplateSnapshot>();
  if (!isJsonRecord(snapshot)) {
    addError(errors, "invalid_snapshot_root", "$.snapshot", "Expected an asset resolution snapshot object.");
    for (const templateId of SITE_DOCUMENT_V1_TEMPLATE_IDS) {
      addError(
        errors,
        "missing_snapshot_template",
        `$.snapshot.templates.${templateId}`,
        `Missing snapshot for template: ${templateId}.`,
      );
    }
    return parsed;
  }
  rejectUnknownFields(snapshot, ["siteId", "templates"], "$.snapshot", errors);
  if (typeof snapshot.siteId !== "string" || !UUID_V4_PATTERN.test(snapshot.siteId)) {
    addError(errors, "invalid_site_id", "$.snapshot.siteId", "Snapshot Site ID must be UUID v4.");
  }
  if (!Array.isArray(snapshot.templates)) {
    addError(errors, "invalid_type", "$.snapshot.templates", "Expected an array.");
    for (const templateId of SITE_DOCUMENT_V1_TEMPLATE_IDS) {
      addError(
        errors,
        "missing_snapshot_template",
        `$.snapshot.templates.${templateId}`,
        `Missing snapshot for template: ${templateId}.`,
      );
    }
    return parsed;
  }

  const globalSourceResolutions = new Map<string, string>();
  snapshot.templates.forEach((rawTemplate, templateIndex) => {
    const rawPath = itemPath("$.snapshot.templates", templateIndex);
    if (!isJsonRecord(rawTemplate)) {
      addError(errors, "invalid_type", rawPath, "Expected a template snapshot object.");
      return;
    }
    rejectUnknownFields(rawTemplate, ["templateId", "templateVersion", "mode", "slots"], rawPath, errors);
    if (typeof rawTemplate.templateId !== "string" || !isSiteDocumentV1TemplateId(rawTemplate.templateId)) {
      addError(errors, "unknown_template", fieldPath(rawPath, "templateId"), "Unknown snapshot template.");
      return;
    }
    const templateId = rawTemplate.templateId;
    const stablePath = `$.snapshot.templates.${templateId}`;
    if (parsed.has(templateId)) {
      addError(
        errors,
        "duplicate_snapshot_template",
        stablePath,
        `Duplicate snapshot for template: ${templateId}.`,
      );
      return;
    }
    if (rawTemplate.templateVersion !== TEMPLATE_VERSION) {
      addError(
        errors,
        "invalid_template_version",
        fieldPath(stablePath, "templateVersion"),
        "Legacy template compatibility is frozen at version 1.",
      );
    }
    const mode = rawTemplate.mode;
    if (mode !== "explicit" && mode !== "fallback") {
      addError(errors, "invalid_value", fieldPath(stablePath, "mode"), "Expected explicit or fallback.");
    }
    if (!Array.isArray(rawTemplate.slots)) {
      addError(errors, "invalid_type", fieldPath(stablePath, "slots"), "Expected an array.");
    }

    const parsedTemplate: ParsedTemplateSnapshot = {
      templateId,
      templateVersion: TEMPLATE_VERSION,
      mode: mode === "explicit" ? "explicit" : "fallback",
      slots: [],
    };
    parsed.set(templateId, parsedTemplate);

    if (legacy) {
      const expectedMode = legacy.explicitTemplates.has(templateId) ? "explicit" : "fallback";
      if (mode !== expectedMode) {
        addError(
          errors,
          "snapshot_mode_mismatch",
          fieldPath(stablePath, "mode"),
          `Expected ${expectedMode} mode for the raw templateWorks key state.`,
        );
      }
    }
    if (!Array.isArray(rawTemplate.slots)) return;

    const seenSlots = new Set<number>();
    const seenSources = new Set<string>();
    rawTemplate.slots.forEach((rawSlot, slotPosition) => {
      const slotPath = `${stablePath}.slots[${slotPosition}]`;
      if (!isJsonRecord(rawSlot)) {
        addError(errors, "invalid_type", slotPath, "Expected a slot snapshot object.");
        return;
      }
      rejectUnknownFields(rawSlot, ["source", "slotIndex", "resolution"], slotPath, errors);
      const slotIndex = rawSlot.slotIndex;
      const slotCount = LEGACY_SITE_CONTENT_TEMPLATE_SPECS[templateId].slotCount;
      if (
        typeof slotIndex !== "number"
        || !Number.isSafeInteger(slotIndex)
        || slotIndex < 0
        || slotIndex >= slotCount
      ) {
        addError(
          errors,
          "slot_out_of_range",
          fieldPath(slotPath, "slotIndex"),
          `Expected a slot index from 0 to ${slotCount - 1}.`,
        );
        return;
      }
      if (seenSlots.has(slotIndex)) {
        addError(
          errors,
          "duplicate_slot",
          fieldPath(slotPath, "slotIndex"),
          `Duplicate snapshot slot index: ${slotIndex}.`,
        );
      }
      seenSlots.add(slotIndex);

      if (!isJsonRecord(rawSlot.source)) {
        addError(errors, "invalid_source", fieldPath(slotPath, "source"), "Expected a structured source.");
        return;
      }
      rejectUnknownFields(rawSlot.source, ["collection", "workIndex"], fieldPath(slotPath, "source"), errors);
      const collection = rawSlot.source.collection;
      const workIndex = rawSlot.source.workIndex;
      if (
        (collection !== "works" && collection !== "templateWorks")
        || typeof workIndex !== "number"
        || !Number.isSafeInteger(workIndex)
        || workIndex < 0
      ) {
        addError(errors, "invalid_source", fieldPath(slotPath, "source"), "Invalid legacy work source.");
        return;
      }
      const source: LegacyWorkSource = { collection, workIndex };
      const sourceKey = `${collection}:${workIndex}`;
      if (seenSources.has(sourceKey)) {
        addError(
          errors,
          "duplicate_source",
          fieldPath(slotPath, "source"),
          `Duplicate source assignment: ${sourceKey}.`,
        );
      }
      seenSources.add(sourceKey);

      const expectedCollection = mode === "explicit" ? "templateWorks" : "works";
      if (collection !== expectedCollection) {
        addError(
          errors,
          "invalid_source",
          fieldPath(slotPath, "source.collection"),
          `Expected ${expectedCollection} source for ${mode} mode.`,
        );
      }
      const work = collection === "works"
        ? legacy?.works[workIndex]
        : legacy?.templateWorks[templateId]?.[workIndex];
      if (!work || work.enabled === false) {
        addError(
          errors,
          "invalid_source",
          fieldPath(slotPath, "source"),
          work ? "Disabled works must not appear in the snapshot." : "Source work does not exist.",
        );
        return;
      }
      if (
        work.slotIndex !== undefined
        && work.slotIndex < slotCount
        && work.slotIndex !== slotIndex
      ) {
        addError(
          errors,
          "snapshot_conflict",
          fieldPath(slotPath, "slotIndex"),
          `Snapshot slot conflicts with legacy slotIndex ${work.slotIndex}.`,
        );
      }

      if (!isJsonRecord(rawSlot.resolution)) {
        addError(errors, "invalid_type", fieldPath(slotPath, "resolution"), "Expected a resolution object.");
        return;
      }
      const status = rawSlot.resolution.status;
      let resolution: ParsedTemplateSnapshot["slots"][number]["resolution"];
      if (status === "resolved") {
        rejectUnknownFields(rawSlot.resolution, ["status", "assetId"], fieldPath(slotPath, "resolution"), errors);
        const assetId = rawSlot.resolution.assetId;
        if (typeof assetId !== "string" || !UUID_V4_PATTERN.test(assetId)) {
          addError(
            errors,
            "invalid_asset_id",
            fieldPath(slotPath, "resolution.assetId"),
            "Resolved Asset ID must be UUID v4.",
          );
          return;
        }
        resolution = { status: "resolved", assetId };
      } else if (status === "unresolved") {
        rejectUnknownFields(rawSlot.resolution, ["status", "reason"], fieldPath(slotPath, "resolution"), errors);
        const reason = rawSlot.resolution.reason;
        if (
          typeof reason !== "string"
          || reason.length > MAX_DIAGNOSTIC_CODE_LENGTH
          || !STABLE_DIAGNOSTIC_CODE_PATTERN.test(reason)
        ) {
          addError(
            errors,
            "invalid_value",
            fieldPath(slotPath, "resolution.reason"),
            "Unresolved reason must be a lowercase snake_case code of at most 80 characters.",
          );
          return;
        }
        resolution = { status: "unresolved", reason };
      } else {
        addError(
          errors,
          "invalid_value",
          fieldPath(slotPath, "resolution.status"),
          "Expected resolved or unresolved status.",
        );
        return;
      }

      const globalSourceKey = collection === "works"
        ? `works:${workIndex}`
        : `templateWorks:${templateId}:${workIndex}`;
      const resolutionKey = resolution.status === "resolved"
        ? `resolved:${resolution.assetId}`
        : `unresolved:${resolution.reason}`;
      const existingResolution = globalSourceResolutions.get(globalSourceKey);
      if (existingResolution !== undefined && existingResolution !== resolutionKey) {
        addError(
          errors,
          "snapshot_conflict",
          fieldPath(slotPath, "resolution"),
          `Conflicting resolutions for legacy source ${globalSourceKey}.`,
        );
      } else {
        globalSourceResolutions.set(globalSourceKey, resolutionKey);
      }

      parsedTemplate.slots.push({ source, slotIndex, resolution, work });
      if (resolution.status === "unresolved") {
        unresolved.push({
          code: resolution.reason,
          path: `$.snapshot.templates.${templateId}.slots[${slotIndex}]`,
          source: { collection, workIndex },
          templateId,
          slotIndex,
          message: `Legacy asset remains unresolved: ${resolution.reason}.`,
        });
      }
    });

    if (legacy && legacy.explicitTemplates.has(templateId)) {
      const explicitWorks = legacy.templateWorks[templateId] ?? [];
      explicitWorks.forEach((work, workIndex) => {
        if (!work.enabled || seenSources.has(`templateWorks:${workIndex}`)) return;
        addError(
          errors,
          "invalid_source",
          `$.templateWorks.${templateId}[${workIndex}]`,
          "Enabled explicit work is missing from the snapshot; provide a resolved or unresolved slot.",
        );
      });
    }
  });

  for (const templateId of SITE_DOCUMENT_V1_TEMPLATE_IDS) {
    if (!parsed.has(templateId)) {
      addError(
        errors,
        "missing_snapshot_template",
        `$.snapshot.templates.${templateId}`,
        `Missing snapshot for template: ${templateId}.`,
      );
    }
  }
  return parsed;
}

function warningsFrom(
  warningPaths: Map<LegacySiteContentAdapterWarningCode, Set<string>>,
): LegacySiteContentAdapterWarning[] {
  return [...warningPaths.entries()]
    .map(([code, paths]) => {
      const sortedPaths = [...paths].sort();
      return {
        code,
        paths: sortedPaths,
        count: sortedPaths.length,
        message: WARNING_MESSAGES[code],
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));
}

function sortErrors(errors: LegacySiteContentAdapterError[]) {
  return errors.sort((left, right) => (
    `${left.path}\u0000${left.code}\u0000${left.message}`
      .localeCompare(`${right.path}\u0000${right.code}\u0000${right.message}`)
  ));
}

function sortUnresolved(unresolved: LegacySiteContentAdapterUnresolved[]) {
  return unresolved.sort((left, right) => (
    `${left.path}\u0000${left.code}\u0000${left.message}`
      .localeCompare(`${right.path}\u0000${right.code}\u0000${right.message}`)
  ));
}

function nonEmpty<T>(values: T[]): NonEmptyReadonlyArray<T> {
  if (values.length === 0) throw new Error("Expected a non-empty diagnostic collection.");
  return [values[0], ...values.slice(1)];
}

function invalidResult(
  errors: LegacySiteContentAdapterError[],
  warnings: readonly LegacySiteContentAdapterWarning[],
  unresolved: LegacySiteContentAdapterUnresolved[],
): LegacySiteContentAdapterResult {
  return {
    status: "invalid",
    document: null,
    warnings,
    unresolved: sortUnresolved(unresolved),
    errors: nonEmpty(sortErrors(errors)),
  };
}

export function adaptLegacySiteContentToSiteDocumentV1(
  rawLegacyContent: unknown,
  snapshot: LegacySiteContentAssetSnapshot,
): LegacySiteContentAdapterResult {
  const errors: LegacySiteContentAdapterError[] = [];
  const unresolved: LegacySiteContentAdapterUnresolved[] = [];
  const warningPaths = new Map<LegacySiteContentAdapterWarningCode, Set<string>>();
  const legacy = parseLegacySiteContent(rawLegacyContent, errors, warningPaths);
  const templateSnapshots = validateSnapshot(snapshot, legacy, errors, unresolved);
  const warnings = warningsFrom(warningPaths);

  if (!legacy || errors.length > 0) return invalidResult(errors, warnings, unresolved);

  const compositions: SiteDocumentV1["compositions"] = {};
  for (const templateId of SITE_DOCUMENT_V1_TEMPLATE_IDS) {
    const templateSnapshot = templateSnapshots.get(templateId);
    if (!templateSnapshot) continue;
    const slots: SlotComposition[] = templateSnapshot.slots
      .filter((slot) => slot.resolution.status === "resolved")
      .sort((left, right) => {
        const bySlot = left.slotIndex - right.slotIndex;
        if (bySlot !== 0) return bySlot;
        const leftSource = `${left.source.collection}:${left.source.workIndex}`;
        const rightSource = `${right.source.collection}:${right.source.workIndex}`;
        return leftSource.localeCompare(rightSource);
      })
      .map((slot): SlotComposition => ({
        slotIndex: slot.slotIndex,
        assetId: slot.resolution.status === "resolved" ? slot.resolution.assetId : "",
        locked: slot.work.locked ?? false,
        focus: { x: slot.work.focus.x, y: slot.work.focus.y },
        title: slot.work.title,
        subtitle: slot.work.subtitle,
      }));
    compositions[templateId] = { templateVersion: TEMPLATE_VERSION, slots };
  }

  const candidate: SiteDocumentV1 = {
    schemaVersion: SITE_DOCUMENT_SCHEMA_VERSION,
    activeTemplate: legacy.activeTemplate,
    profile: legacy.profile,
    hero: legacy.hero,
    trustItems: legacy.trustItems,
    packages: legacy.packages,
    contact: legacy.contact,
    social: legacy.social,
    bookingFields: legacy.bookingFields,
    statement: legacy.statement,
    compositions,
  };
  const parsed = parseSiteDocumentV1(candidate);
  if (!parsed.success) {
    for (const issue of parsed.issues) {
      addError(errors, "site_document_invalid", issue.path, `${issue.code}: ${issue.message}`);
    }
    return invalidResult(errors, warnings, unresolved);
  }

  const sortedUnresolved = sortUnresolved(unresolved);
  if (sortedUnresolved.length > 0) {
    return {
      status: "blocked-by-unresolved",
      documentPreview: parsed.data,
      warnings,
      unresolved: nonEmpty(sortedUnresolved),
      errors: [],
    };
  }
  return {
    status: "ready",
    document: parsed.data,
    warnings,
    unresolved: [],
    errors: [],
  };
}

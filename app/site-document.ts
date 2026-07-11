export const SITE_DOCUMENT_SCHEMA_VERSION = 1 as const;

/**
 * The template identities accepted by schemaVersion 1 are immutable contract
 * data. Runtime catalog changes must not expand or invalidate historical V1
 * documents; renderer support is checked by a separate compatibility layer.
 */
export const SITE_DOCUMENT_V1_TEMPLATE_IDS = Object.freeze([
  "cinematic-light",
  "neon-hud",
  "film-rail",
  "manga-panels",
  "prism-liquid",
  "orbital-portal",
  "archive-os",
  "editorial-duet",
  "polaroid-field",
  "character-select",
  "museum-depth",
] as const);

export type SiteDocumentV1TemplateId = (typeof SITE_DOCUMENT_V1_TEMPLATE_IDS)[number];

const siteDocumentV1TemplateIds = new Set<string>(SITE_DOCUMENT_V1_TEMPLATE_IDS);

export function isSiteDocumentV1TemplateId(value: unknown): value is SiteDocumentV1TemplateId {
  return typeof value === "string" && siteDocumentV1TemplateIds.has(value);
}

const MAX_TEXT_LENGTH = 2_048;
const MAX_TRUST_ITEMS = 8;
const MAX_PACKAGES = 12;
const MAX_DELIVERABLES = 12;
const MAX_SOCIAL_LINKS = 8;
const MAX_BOOKING_FIELDS = 30;
const MAX_COMPOSITION_SLOTS = 256;
const MAX_ASSET_ID_LENGTH = MAX_TEXT_LENGTH;
const ASSET_ID_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

export type ProfileContent = {
  brand: string;
  mark: string;
  photographer: string;
  role: string;
  city: string;
  availability: string;
  intro: string;
};

export type HeroContent = {
  eyebrow: string;
  title: string;
  services: string;
};

export type TrustItem = {
  label: string;
  value: string;
};

export type PhotographyPackage = {
  number: string;
  english: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  deliverables: string[];
  enabled: boolean;
};

export type ContactContent = {
  wechat: string;
  email: string;
  note: string;
};

export type SocialLink = {
  label: string;
  handle: string;
};

export type StatementContent = {
  eyebrow: string;
  lineOne: string;
  lineTwo: string;
};

export type FocusPoint = {
  x: number;
  y: number;
};

/**
 * An opaque reference only. This type does not choose an ID generator,
 * uniqueness scope, migration algorithm, or public encoding.
 */
export type AssetId = string;

export type SlotComposition = {
  slotIndex: number;
  assetId: AssetId;
  locked: boolean;
  focus: FocusPoint;
  title?: string;
  subtitle?: string;
};

export type TemplateComposition = {
  templateVersion: number;
  slots: SlotComposition[];
};

/**
 * Portable, versioned page content. Tenant identity and resolved asset data
 * belong to a future Site Revision envelope and AssetResolver, not this value.
 */
export type SiteDocumentV1 = {
  schemaVersion: typeof SITE_DOCUMENT_SCHEMA_VERSION;
  activeTemplate: SiteDocumentV1TemplateId;
  profile: ProfileContent;
  hero: HeroContent;
  trustItems: TrustItem[];
  packages: PhotographyPackage[];
  contact: ContactContent;
  social: SocialLink[];
  bookingFields: string[];
  statement: StatementContent;
  compositions: Partial<Record<SiteDocumentV1TemplateId, TemplateComposition>>;
};

export type SiteDocument = SiteDocumentV1;

export type SiteDocumentValidationIssueCode =
  | "duplicate_reference"
  | "invalid_type"
  | "invalid_value"
  | "limit_exceeded"
  | "unknown_field"
  | "unknown_template"
  | "unsupported_field"
  | "unsupported_schema_version";

export type SiteDocumentValidationIssue = {
  path: string;
  code: SiteDocumentValidationIssueCode;
  message: string;
};

export type SiteDocumentParseResult =
  | { success: true; data: SiteDocumentV1 }
  | { success: false; issues: SiteDocumentValidationIssue[] };

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fieldPath(parent: string, field: string) {
  return `${parent}.${field}`;
}

function itemPath(parent: string, index: number) {
  return `${parent}[${index}]`;
}

function addIssue(
  issues: SiteDocumentValidationIssue[],
  path: string,
  code: SiteDocumentValidationIssueCode,
  message: string,
) {
  issues.push({ path, code, message });
}

function recordValue(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
): JsonRecord | null {
  if (isJsonRecord(value)) return value;
  addIssue(issues, path, "invalid_type", "Expected an object.");
  return null;
}

function rejectUnknownFields(
  value: JsonRecord,
  allowedFields: readonly string[],
  path: string,
  issues: SiteDocumentValidationIssue[],
) {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      addIssue(issues, fieldPath(path, field), "unknown_field", `Unknown field: ${field}.`);
    }
  }
}

function stringValue(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
  maximumLength = MAX_TEXT_LENGTH,
) {
  if (typeof value !== "string") {
    addIssue(issues, path, "invalid_type", "Expected a string.");
    return "";
  }
  if (value.length > maximumLength) {
    addIssue(issues, path, "limit_exceeded", `String exceeds ${maximumLength} characters.`);
  }
  return value;
}

function optionalStringValue(
  value: JsonRecord,
  field: string,
  path: string,
  issues: SiteDocumentValidationIssue[],
) {
  if (!Object.prototype.hasOwnProperty.call(value, field)) return undefined;
  return stringValue(value[field], fieldPath(path, field), issues);
}

function booleanValue(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
) {
  if (typeof value === "boolean") return value;
  addIssue(issues, path, "invalid_type", "Expected a boolean.");
  return false;
}

function safeIntegerValue(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
  minimum: number,
) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= minimum) return value;
  addIssue(issues, path, "invalid_value", `Expected a safe integer greater than or equal to ${minimum}.`);
  return minimum;
}

function slotIndexValue(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
  maximumExclusive: number,
) {
  if (
    typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value < maximumExclusive
  ) return value;
  addIssue(
    issues,
    path,
    "invalid_value",
    `Expected a safe integer from 0 to ${maximumExclusive - 1}.`,
  );
  return 0;
}

function percentageValue(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) return value;
  addIssue(issues, path, "invalid_value", "Expected a finite percentage from 0 to 100.");
  return 50;
}

function arrayValue(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
  maximumLength: number,
) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "invalid_type", "Expected an array.");
    return [];
  }
  if (value.length > maximumLength) {
    addIssue(issues, path, "limit_exceeded", `Array exceeds ${maximumLength} items.`);
  }
  return value.slice(0, maximumLength);
}

function stringObject<T extends JsonRecord>(
  value: unknown,
  path: string,
  fields: readonly string[],
  issues: SiteDocumentValidationIssue[],
) {
  const source = recordValue(value, path, issues);
  if (!source) return Object.fromEntries(fields.map((field) => [field, ""])) as T;
  rejectUnknownFields(source, fields, path, issues);
  return Object.fromEntries(fields.map((field) => [
    field,
    stringValue(source[field], fieldPath(path, field), issues),
  ])) as T;
}

function parseProfile(value: unknown, issues: SiteDocumentValidationIssue[]): ProfileContent {
  return stringObject<ProfileContent & JsonRecord>(value, "$.profile", [
    "brand",
    "mark",
    "photographer",
    "role",
    "city",
    "availability",
    "intro",
  ], issues);
}

function parseHero(value: unknown, issues: SiteDocumentValidationIssue[]): HeroContent {
  return stringObject<HeroContent & JsonRecord>(value, "$.hero", [
    "eyebrow",
    "title",
    "services",
  ], issues);
}

function parseTrustItems(value: unknown, issues: SiteDocumentValidationIssue[]): TrustItem[] {
  const path = "$.trustItems";
  return arrayValue(value, path, issues, MAX_TRUST_ITEMS).map((item, index) => {
    const itemValue = recordValue(item, itemPath(path, index), issues);
    if (!itemValue) return { label: "", value: "" };
    const itemValuePath = itemPath(path, index);
    rejectUnknownFields(itemValue, ["label", "value"], itemValuePath, issues);
    return {
      label: stringValue(itemValue.label, fieldPath(itemValuePath, "label"), issues),
      value: stringValue(itemValue.value, fieldPath(itemValuePath, "value"), issues),
    };
  });
}

function parseStringArray(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
  maximumLength: number,
) {
  return arrayValue(value, path, issues, maximumLength)
    .map((item, index) => stringValue(item, itemPath(path, index), issues));
}

function parsePackages(value: unknown, issues: SiteDocumentValidationIssue[]): PhotographyPackage[] {
  const path = "$.packages";
  return arrayValue(value, path, issues, MAX_PACKAGES).map((item, index) => {
    const itemValuePath = itemPath(path, index);
    const itemValue = recordValue(item, itemValuePath, issues);
    if (!itemValue) {
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
    rejectUnknownFields(itemValue, [
      "number",
      "english",
      "name",
      "description",
      "price",
      "duration",
      "deliverables",
      "enabled",
    ], itemValuePath, issues);
    return {
      number: stringValue(itemValue.number, fieldPath(itemValuePath, "number"), issues),
      english: stringValue(itemValue.english, fieldPath(itemValuePath, "english"), issues),
      name: stringValue(itemValue.name, fieldPath(itemValuePath, "name"), issues),
      description: stringValue(itemValue.description, fieldPath(itemValuePath, "description"), issues),
      price: stringValue(itemValue.price, fieldPath(itemValuePath, "price"), issues),
      duration: stringValue(itemValue.duration, fieldPath(itemValuePath, "duration"), issues),
      deliverables: parseStringArray(
        itemValue.deliverables,
        fieldPath(itemValuePath, "deliverables"),
        issues,
        MAX_DELIVERABLES,
      ),
      enabled: booleanValue(itemValue.enabled, fieldPath(itemValuePath, "enabled"), issues),
    };
  });
}

function parseContact(value: unknown, issues: SiteDocumentValidationIssue[]): ContactContent {
  return stringObject<ContactContent & JsonRecord>(value, "$.contact", [
    "wechat",
    "email",
    "note",
  ], issues);
}

function parseSocial(value: unknown, issues: SiteDocumentValidationIssue[]): SocialLink[] {
  const path = "$.social";
  return arrayValue(value, path, issues, MAX_SOCIAL_LINKS).map((item, index) => {
    const itemValuePath = itemPath(path, index);
    const itemValue = recordValue(item, itemValuePath, issues);
    if (!itemValue) return { label: "", handle: "" };
    rejectUnknownFields(itemValue, ["label", "handle"], itemValuePath, issues);
    return {
      label: stringValue(itemValue.label, fieldPath(itemValuePath, "label"), issues),
      handle: stringValue(itemValue.handle, fieldPath(itemValuePath, "handle"), issues),
    };
  });
}

function parseStatement(value: unknown, issues: SiteDocumentValidationIssue[]): StatementContent {
  return stringObject<StatementContent & JsonRecord>(value, "$.statement", [
    "eyebrow",
    "lineOne",
    "lineTwo",
  ], issues);
}

function parseAssetId(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
) {
  if (typeof value !== "string") {
    addIssue(issues, path, "invalid_type", "Expected an opaque asset ID string.");
    return "";
  }
  if (
    value.length === 0
    || value.trim().length === 0
    || value.length > MAX_ASSET_ID_LENGTH
    || ASSET_ID_CONTROL_CHARACTERS.test(value)
  ) {
    addIssue(
      issues,
      path,
      "invalid_value",
      `Asset ID must be non-blank, at most ${MAX_ASSET_ID_LENGTH} characters, and contain no control characters.`,
    );
  }
  return value;
}

function parseFocus(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
): FocusPoint {
  const source = recordValue(value, path, issues);
  if (!source) return { x: 50, y: 50 };
  rejectUnknownFields(source, ["x", "y"], path, issues);
  return {
    x: percentageValue(source.x, fieldPath(path, "x"), issues),
    y: percentageValue(source.y, fieldPath(path, "y"), issues),
  };
}

function parseSlot(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
): SlotComposition {
  const source = recordValue(value, path, issues);
  if (!source) {
    return { slotIndex: 0, assetId: "", locked: false, focus: { x: 50, y: 50 } };
  }
  rejectUnknownFields(source, [
    "slotIndex",
    "assetId",
    "locked",
    "focus",
    "title",
    "subtitle",
  ], path, issues);
  const title = optionalStringValue(source, "title", path, issues);
  const subtitle = optionalStringValue(source, "subtitle", path, issues);
  return {
    slotIndex: slotIndexValue(
      source.slotIndex,
      fieldPath(path, "slotIndex"),
      issues,
      MAX_COMPOSITION_SLOTS,
    ),
    assetId: parseAssetId(source.assetId, fieldPath(path, "assetId"), issues),
    locked: booleanValue(source.locked, fieldPath(path, "locked"), issues),
    focus: parseFocus(source.focus, fieldPath(path, "focus"), issues),
    ...(title === undefined ? {} : { title }),
    ...(subtitle === undefined ? {} : { subtitle }),
  };
}

function parseComposition(
  value: unknown,
  path: string,
  issues: SiteDocumentValidationIssue[],
): TemplateComposition {
  const source = recordValue(value, path, issues);
  if (!source) return { templateVersion: 1, slots: [] };
  rejectUnknownFields(source, ["templateVersion", "slots"], path, issues);

  const slotsPath = fieldPath(path, "slots");
  const slots = arrayValue(source.slots, slotsPath, issues, MAX_COMPOSITION_SLOTS)
    .map((slot, index) => parseSlot(slot, itemPath(slotsPath, index), issues));
  const slotIndexes = new Set<number>();

  slots.forEach((slot, index) => {
    const slotPath = itemPath(slotsPath, index);
    if (slotIndexes.has(slot.slotIndex)) {
      addIssue(
        issues,
        fieldPath(slotPath, "slotIndex"),
        "duplicate_reference",
        `Duplicate slot index: ${slot.slotIndex}.`,
      );
    }
    slotIndexes.add(slot.slotIndex);
  });

  return {
    templateVersion: safeIntegerValue(
      source.templateVersion,
      fieldPath(path, "templateVersion"),
      issues,
      1,
    ),
    slots,
  };
}

function parseCompositions(
  value: unknown,
  issues: SiteDocumentValidationIssue[],
): Partial<Record<SiteDocumentV1TemplateId, TemplateComposition>> {
  const path = "$.compositions";
  const source = recordValue(value, path, issues);
  if (!source) return {};

  const compositions: Partial<Record<SiteDocumentV1TemplateId, TemplateComposition>> = {};
  for (const [templateId, composition] of Object.entries(source)) {
    const compositionPath = fieldPath(path, templateId);
    if (!isSiteDocumentV1TemplateId(templateId)) {
      addIssue(issues, compositionPath, "unknown_template", `Unknown template: ${templateId}.`);
      continue;
    }
    compositions[templateId] = parseComposition(composition, compositionPath, issues);
  }
  return compositions;
}

function parseActiveTemplate(
  value: unknown,
  issues: SiteDocumentValidationIssue[],
): SiteDocumentV1TemplateId {
  const path = "$.activeTemplate";
  if (typeof value !== "string") {
    addIssue(issues, path, "invalid_type", "Expected a template ID string.");
    return SITE_DOCUMENT_V1_TEMPLATE_IDS[0];
  }
  if (!isSiteDocumentV1TemplateId(value)) {
    addIssue(issues, path, "unknown_template", `Unknown template: ${value}.`);
    return SITE_DOCUMENT_V1_TEMPLATE_IDS[0];
  }
  return value;
}

/**
 * Strictly validates untrusted JSON as SiteDocumentV1. The parser never
 * migrates legacy SiteContent, remaps asset IDs, resolves files, or strips
 * unknown fields silently; callers receive structured issues instead.
 */
export function parseSiteDocumentV1(value: unknown): SiteDocumentParseResult {
  const issues: SiteDocumentValidationIssue[] = [];
  const source = recordValue(value, "$", issues);
  if (!source) return { success: false, issues };

  rejectUnknownFields(source, [
    "schemaVersion",
    "activeTemplate",
    "profile",
    "hero",
    "trustItems",
    "packages",
    "contact",
    "social",
    "bookingFields",
    "statement",
    "compositions",
    "theme",
  ], "$", issues);

  if (source.schemaVersion !== SITE_DOCUMENT_SCHEMA_VERSION) {
    addIssue(
      issues,
      "$.schemaVersion",
      "unsupported_schema_version",
      `Expected schemaVersion ${SITE_DOCUMENT_SCHEMA_VERSION}.`,
    );
  }
  if (Object.prototype.hasOwnProperty.call(source, "theme")) {
    addIssue(
      issues,
      "$.theme",
      "unsupported_field",
      "Theme overrides are reserved until their safe semantics are defined.",
    );
  }

  const document: SiteDocumentV1 = {
    schemaVersion: SITE_DOCUMENT_SCHEMA_VERSION,
    activeTemplate: parseActiveTemplate(source.activeTemplate, issues),
    profile: parseProfile(source.profile, issues),
    hero: parseHero(source.hero, issues),
    trustItems: parseTrustItems(source.trustItems, issues),
    packages: parsePackages(source.packages, issues),
    contact: parseContact(source.contact, issues),
    social: parseSocial(source.social, issues),
    bookingFields: parseStringArray(
      source.bookingFields,
      "$.bookingFields",
      issues,
      MAX_BOOKING_FIELDS,
    ),
    statement: parseStatement(source.statement, issues),
    compositions: parseCompositions(source.compositions, issues),
  };

  return issues.length > 0 ? { success: false, issues } : { success: true, data: document };
}

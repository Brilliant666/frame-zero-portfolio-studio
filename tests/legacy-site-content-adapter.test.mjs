import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const adapterPath = fileURLToPath(
  new URL("../app/legacy-site-content-adapter.ts", import.meta.url),
);
const siteDocumentPath = fileURLToPath(new URL("../app/site-document.ts", import.meta.url));
const typeFixturePath = fileURLToPath(
  new URL("./fixtures/legacy-site-content-adapter.type-test.ts", import.meta.url),
);

const SITE_ID = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_SPECS = [
  ["cinematic-light", 9],
  ["neon-hud", 9],
  ["film-rail", 9],
  ["manga-panels", 9],
  ["prism-liquid", 9],
  ["orbital-portal", 8],
  ["archive-os", 12],
  ["editorial-duet", 9],
  ["polaroid-field", 9],
  ["character-select", 9],
  ["museum-depth", 7],
];
const TEMPLATE_IDS = TEMPLATE_SPECS.map(([templateId]) => templateId);

function uuid(index) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function transpile(source, fileName) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(
    errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
    `${fileName} must transpile without diagnostics`,
  );
  return result.outputText;
}

async function importAdapter(t) {
  const [adapterSource, siteDocumentSource] = await Promise.all([
    fs.readFile(adapterPath, "utf8"),
    fs.readFile(siteDocumentPath, "utf8"),
  ]);
  const compiled = transpile(adapterSource, "legacy-site-content-adapter.ts");
  const rewritten = compiled.replace(
    /from\s+["']\.\/site-document["'];?/u,
    'from "./site-document.mjs";',
  );
  assert.notEqual(rewritten, compiled, "the strict SiteDocumentV1 parser import must be linked");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-legacy-adapter-"));
  const adapterModulePath = path.join(directory, "legacy-site-content-adapter.mjs");
  const siteDocumentModulePath = path.join(directory, "site-document.mjs");
  await Promise.all([
    fs.writeFile(adapterModulePath, rewritten, "utf8"),
    fs.writeFile(
      siteDocumentModulePath,
      transpile(siteDocumentSource, "site-document.ts"),
      "utf8",
    ),
  ]);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const [adapter, siteDocument] = await Promise.all([
    import(`${pathToFileURL(adapterModulePath).href}?test=${Date.now()}-${Math.random()}`),
    import(pathToFileURL(siteDocumentModulePath).href),
  ]);
  return { ...adapter, parseSiteDocumentV1: siteDocument.parseSiteDocumentV1 };
}

function makeWork(index, overrides = {}) {
  return {
    code: `LEGACY-${String(index + 1).padStart(2, "0")}`,
    title: `Legacy frame ${index + 1}`,
    subtitle: `Legacy subtitle ${index + 1}`,
    image: `/photos/legacy-${index + 1}-full.webp`,
    preview: `/photos/legacy-${index + 1}-card.webp`,
    position: `${40 + index}% ${50 + index}%`,
    previewWidth: 1200 + index,
    previewHeight: 800 + index,
    fullWidth: 2400 + index,
    enabled: true,
    ...overrides,
  };
}

function makeLegacy(overrides = {}) {
  return {
    activeTemplate: "cinematic-light",
    profile: {
      brand: "FRAME//LEGACY",
      mark: "F//L",
      photographer: "Legacy photographer",
      role: "Cosplay photographer",
      city: "Legacy city",
      availability: "Available",
      intro: "A raw legacy content fixture.",
    },
    hero: {
      eyebrow: "LEGACY PHOTOGRAPHY",
      title: "LEGACY FRAME",
      services: "Convention / private sessions",
    },
    trustItems: [
      { label: "DELIVERY", value: "7 days" },
      { label: "CITY", value: "Legacy city" },
    ],
    works: [makeWork(0)],
    templateWorks: {},
    packages: [{
      number: "01",
      english: "PRIVATE",
      name: "Private session",
      description: "A legacy package.",
      price: "Example price",
      duration: "2 HOURS",
      deliverables: ["12 edits", "Private gallery"],
      enabled: true,
    }],
    contact: {
      wechat: "LEGACY_DEMO",
      email: "legacy@framezero.example",
      note: "Legacy contact details",
    },
    social: [{ label: "Example", handle: "@legacy" }],
    bookingFields: ["Character:", "Date:", "City:"],
    statement: {
      eyebrow: "LEGACY STATEMENT",
      lineOne: "Line one",
      lineTwo: "Line two",
    },
    ...overrides,
  };
}

function hasOwnTemplate(legacy, templateId) {
  return Object.prototype.hasOwnProperty.call(legacy.templateWorks, templateId);
}

function makeResolvedSlot(templateIndex, mode, workIndex = 0, slotIndex = 0) {
  const assetIndex = mode === "fallback"
    ? workIndex + 1
    : 1_000 + (templateIndex * 100) + workIndex;
  return {
    source: {
      collection: mode === "explicit" ? "templateWorks" : "works",
      workIndex,
    },
    slotIndex,
    resolution: { status: "resolved", assetId: uuid(assetIndex) },
  };
}

function makeSnapshot(legacy, overrides = {}) {
  const templates = TEMPLATE_SPECS.map(([templateId], templateIndex) => {
    const mode = hasOwnTemplate(legacy, templateId) ? "explicit" : "fallback";
    const sourceWorks = mode === "explicit" ? legacy.templateWorks[templateId] : legacy.works;
    const firstEnabledIndex = Array.isArray(sourceWorks)
      ? sourceWorks.findIndex((work) => work?.enabled !== false)
      : -1;
    return {
      templateId,
      templateVersion: 1,
      mode,
      slots: firstEnabledIndex < 0
        ? []
        : [makeResolvedSlot(templateIndex, mode, firstEnabledIndex, 0)],
    };
  });

  return {
    siteId: SITE_ID,
    templates,
    ...overrides,
  };
}

function templateEntry(snapshot, templateId) {
  return snapshot.templates.find((template) => template.templateId === templateId);
}

function composition(document, templateId) {
  const value = document.compositions[templateId];
  assert.ok(value, `expected a materialized composition for ${templateId}`);
  return value;
}

function assertDiagnosticShape(diagnostics, label) {
  assert.ok(Array.isArray(diagnostics), `${label} must be an array`);
  for (const diagnostic of diagnostics) {
    assert.equal(typeof diagnostic.code, "string", `${label} code must be stable text`);
    assert.ok(diagnostic.code.length > 0, `${label} code must not be empty`);
    assert.equal(typeof diagnostic.message, "string", `${label} message must be text`);
    assert.ok(diagnostic.message.length > 0, `${label} message must not be empty`);
    assert.ok(
      typeof diagnostic.path === "string"
        || (diagnostic.source !== null && typeof diagnostic.source === "object"),
      `${label} must expose a path or structured source`,
    );
  }
}

function assertWarningShape(warnings) {
  assert.ok(Array.isArray(warnings));
  for (const warning of warnings) {
    assert.equal(typeof warning.code, "string");
    assert.ok(warning.code.length > 0);
    assert.ok(Array.isArray(warning.paths));
    assert.equal(warning.count, warning.paths.length);
    assert.equal(typeof warning.message, "string");
    assert.ok(warning.message.length > 0);
    assert.deepEqual(warning.paths, [...warning.paths].sort(), "warning paths must be sorted");
  }
}

function assertInvalid(result, expectedCode) {
  assert.equal(result.status, "invalid");
  assert.equal(result.document, null);
  assert.equal("documentPreview" in result, false);
  assert.ok(result.errors.length > 0);
  assertDiagnosticShape(result.errors, "errors");
  assertDiagnosticShape(result.unresolved, "unresolved");
  assertWarningShape(result.warnings);
  if (expectedCode) {
    assert.ok(
      result.errors.some((error) => error.code === expectedCode),
      `expected ${expectedCode}; received ${JSON.stringify(result.errors)}`,
    );
  }
  return result;
}

function assertReady(result) {
  assert.equal(result.status, "ready");
  assert.equal("document" in result, true);
  assert.equal("documentPreview" in result, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unresolved, []);
  assertWarningShape(result.warnings);
  return result.document;
}

function assertBlocked(result) {
  assert.equal(result.status, "blocked-by-unresolved");
  assert.equal("document" in result, false);
  assert.equal("documentPreview" in result, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.unresolved.length > 0);
  assertDiagnosticShape(result.unresolved, "unresolved");
  assertWarningShape(result.warnings);
  return result.documentPreview;
}

function diagnosticSortKey(diagnostic) {
  const source = typeof diagnostic.path === "string"
    ? diagnostic.path
    : JSON.stringify(diagnostic.source);
  return `${source}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
}

function assertDiagnosticsSorted(diagnostics, label) {
  const keys = diagnostics.map(diagnosticSortKey);
  assert.deepEqual(keys, [...keys].sort(), `${label} must have deterministic path/code order`);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test("the adapter input, snapshot, and three-state result contract type-check", () => {
  const program = ts.createProgram({
    rootNames: [adapterPath, typeFixturePath],
    options: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(
    diagnostics.map((diagnostic) => ({
      file: diagnostic.file?.fileName,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    })),
    [],
  );
});

test("the adapter is isolated from I/O, UUID generation, normalization, and layout modules", async () => {
  const source = await fs.readFile(adapterPath, "utf8");

  assert.match(source, /parseSiteDocumentV1/u);
  assert.doesNotMatch(
    source,
    /\b(?:randomUUID|generateUuidV4|buildPhotoSlots|normalizeSiteContent)\s*\(/u,
  );
  assert.doesNotMatch(
    source,
    /import\s*\{[^}]*\b(?:randomUUID|generateUuidV4|buildPhotoSlots|normalizeSiteContent)\b[^}]*\}/u,
  );
  assert.doesNotMatch(source, /from\s+["']node:crypto["']/u);
  assert.doesNotMatch(source, /from\s+["']node:(?:fs|fs\/promises|http|https|net|dns)["']/u);
  assert.doesNotMatch(
    source,
    /\b(?:require|import)\s*\(\s*["'](?:node:(?:crypto|fs|fs\/promises|http|https|net|dns)|[^"']*(?:templates|photo-slots))/u,
  );
  assert.doesNotMatch(source, /from\s+["']\.\/(?:site-config|photo-library|stable-id-migration)/u);
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:templates|photo-slots)[^"']*["']/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /\bD1Database\b/u);
});

test("converts complete raw legacy content and preserves every root content field", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const explicitWork = makeWork(7, {
    title: "Explicit legacy title",
    subtitle: "Explicit legacy subtitle",
    position: "12.5% 87.25%",
    locked: true,
  });
  const raw = makeLegacy({
    templateWorks: { "cinematic-light": [explicitWork] },
  });
  const result = adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw));
  const document = assertReady(result);

  assert.equal(document.schemaVersion, 1);
  for (const field of [
    "activeTemplate",
    "profile",
    "hero",
    "trustItems",
    "packages",
    "contact",
    "social",
    "bookingFields",
    "statement",
  ]) assert.deepEqual(document[field], raw[field], `legacy root field ${field} must be preserved`);

  const slot = composition(document, "cinematic-light").slots[0];
  assert.deepEqual(slot, {
    slotIndex: 0,
    assetId: uuid(1_000),
    locked: true,
    focus: { x: 12.5, y: 87.25 },
    title: "Explicit legacy title",
    subtitle: "Explicit legacy subtitle",
  });
  assert.equal("works" in document, false);
  assert.equal("templateWorks" in document, false);
});

test("maps all eleven legacy templates one-to-one at templateVersion 1", async (t) => {
  const {
    adaptLegacySiteContentToSiteDocumentV1,
    LEGACY_SITE_CONTENT_TEMPLATE_SPECS,
  } = await importAdapter(t);
  const raw = makeLegacy();
  const document = assertReady(adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)));

  assert.deepEqual(Object.keys(LEGACY_SITE_CONTENT_TEMPLATE_SPECS), TEMPLATE_IDS);
  assert.deepEqual(
    Object.values(LEGACY_SITE_CONTENT_TEMPLATE_SPECS),
    TEMPLATE_SPECS.map(([, slotCount]) => ({ templateVersion: 1, slotCount })),
  );
  assert.deepEqual(Object.keys(document.compositions), TEMPLATE_IDS);
  for (const templateId of TEMPLATE_IDS) {
    assert.equal(composition(document, templateId).templateVersion, 1);
  }
});

test("enforces the exact slot capacity of every frozen template", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ works: Array.from({ length: 13 }, (_, index) => makeWork(index)) });

  for (const [templateId, slotCount] of TEMPLATE_SPECS) {
    const validSnapshot = makeSnapshot(raw);
    const target = templateEntry(validSnapshot, templateId);
    const templateIndex = TEMPLATE_IDS.indexOf(templateId);
    target.slots = Array.from({ length: slotCount }, (_, slotIndex) => (
      makeResolvedSlot(templateIndex, "fallback", slotIndex, slotIndex)
    ));
    const document = assertReady(
      adaptLegacySiteContentToSiteDocumentV1(raw, validSnapshot),
    );
    assert.equal(composition(document, templateId).slots.length, slotCount);

    const overflowSnapshot = structuredClone(validSnapshot);
    templateEntry(overflowSnapshot, templateId).slots.push(
      makeResolvedSlot(templateIndex, "fallback", slotCount, slotCount),
    );
    assertInvalid(
      adaptLegacySiteContentToSiteDocumentV1(raw, overflowSnapshot),
      "slot_out_of_range",
    );
  }
});

test("rejects an unknown activeTemplate without falling back to a demo template", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ activeTemplate: "future-template" });
  const result = assertInvalid(
    adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)),
    "unknown_template",
  );
  assert.ok(result.errors.some((error) => error.path === "$.activeTemplate"));
});

test("rejects unknown templateWorks keys instead of silently dropping them", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ templateWorks: { "future-template": [] } });
  const result = assertInvalid(
    adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)),
    "unknown_template",
  );
  assert.ok(result.errors.some((error) => error.path.includes("future-template")));
});

test("uses only resolved snapshot UUIDs as V1 assetIds", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const fingerprint = "a".repeat(64);
  const raw = makeLegacy({
    works: [makeWork(0, {
      assetId: "legacy-file-name",
      code: fingerprint,
      image: "https://cdn.example.invalid/private/photo-full.webp",
      preview: "/photos/private-photo-card.webp",
      title: "Safe title",
      subtitle: "Safe subtitle",
    })],
  });
  const document = assertReady(
    adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)),
  );
  const assetIds = Object.values(document.compositions)
    .flatMap((value) => value.slots.map((slot) => slot.assetId));
  assert.deepEqual(assetIds, TEMPLATE_IDS.map(() => uuid(1)));

  const serialized = JSON.stringify(document);
  for (const forbidden of [
    fingerprint,
    "legacy-file-name",
    "https://cdn.example.invalid/private/photo-full.webp",
    "/photos/private-photo-card.webp",
    "private-photo-card.webp",
  ]) assert.equal(serialized.includes(forbidden), false, `${forbidden} must not enter the V1 document`);
});

test("rejects non-UUID resolved asset IDs rather than deriving or accepting identity", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({
    works: [makeWork(0, { assetId: "legacy-asset", code: "DISPLAY-CODE" })],
  });
  const candidates = [
    raw.works[0].image,
    raw.works[0].preview,
    "legacy-1-full.webp",
    raw.works[0].code,
    "b".repeat(64),
    raw.works[0].assetId,
    "https://example.invalid/not-an-id",
  ];

  for (const assetId of candidates) {
    const snapshot = makeSnapshot(raw);
    templateEntry(snapshot, "cinematic-light").slots[0].resolution.assetId = assetId;
    assertInvalid(
      adaptLegacySiteContentToSiteDocumentV1(raw, snapshot),
      "invalid_asset_id",
    );
  }
});

test("omits unresolved slots and returns a blocked audit preview", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ templateWorks: { "cinematic-light": [makeWork(2)] } });
  const snapshot = makeSnapshot(raw);
  templateEntry(snapshot, "cinematic-light").slots[0].resolution = {
    status: "unresolved",
    reason: "missing_source_fingerprint",
  };

  const result = adaptLegacySiteContentToSiteDocumentV1(raw, snapshot);
  const preview = assertBlocked(result);
  assert.deepEqual(composition(preview, "cinematic-light").slots, []);
  assert.ok(result.unresolved.some((item) => item.code === "missing_source_fingerprint"));
  assert.equal(
    JSON.stringify(preview).includes(raw.templateWorks["cinematic-light"][0].image),
    false,
  );
});

test("rejects an enabled explicit work omitted from the snapshot", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ templateWorks: { "cinematic-light": [makeWork(2)] } });
  const snapshot = makeSnapshot(raw);
  templateEntry(snapshot, "cinematic-light").slots = [];

  const result = assertInvalid(
    adaptLegacySiteContentToSiteDocumentV1(raw, snapshot),
    "invalid_source",
  );
  assert.ok(result.errors.some(
    (error) => error.path === "$.templateWorks.cinematic-light[0]",
  ));
});

test("rejects unstable unresolved reason codes", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ templateWorks: { "cinematic-light": [makeWork(2)] } });

  for (const reason of [
    "",
    "Missing asset mapping",
    "missing-asset-mapping",
    "not_a_code/value",
    "a".repeat(81),
  ]) {
    const snapshot = makeSnapshot(raw);
    templateEntry(snapshot, "cinematic-light").slots[0].resolution = {
      status: "unresolved",
      reason,
    };
    const result = assertInvalid(
      adaptLegacySiteContentToSiteDocumentV1(raw, snapshot),
      "invalid_value",
    );
    assert.ok(result.errors.some(
      (error) => error.path.endsWith("resolution.reason"),
    ));
  }
});

test("rejects duplicate, out-of-range, incomplete, and conflicting snapshot data", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ works: [makeWork(0), makeWork(1)] });

  const duplicateSlot = makeSnapshot(raw);
  templateEntry(duplicateSlot, "cinematic-light").slots.push({
    ...makeResolvedSlot(0, "fallback", 1, 0),
    resolution: { status: "resolved", assetId: uuid(40) },
  });

  const outOfRange = makeSnapshot(raw);
  templateEntry(outOfRange, "cinematic-light").slots[0].slotIndex = 9;

  const duplicateTemplate = makeSnapshot(raw);
  duplicateTemplate.templates.push(structuredClone(duplicateTemplate.templates[0]));

  const duplicateSource = makeSnapshot(raw);
  templateEntry(duplicateSource, "cinematic-light").slots.push({
    ...makeResolvedSlot(0, "fallback", 0, 1),
    resolution: { status: "resolved", assetId: uuid(41) },
  });

  const incomplete = makeSnapshot(raw);
  incomplete.templates.pop();

  const invalidSite = makeSnapshot(raw, { siteId: "site-from-domain" });

  const invalidVersion = makeSnapshot(raw);
  templateEntry(invalidVersion, "cinematic-light").templateVersion = 2;

  const invalidSource = makeSnapshot(raw);
  templateEntry(invalidSource, "cinematic-light").slots[0].source.workIndex = 99;

  const unknownSnapshotTemplate = makeSnapshot(raw);
  unknownSnapshotTemplate.templates[0].templateId = "future-template";

  const conflictingResolution = makeSnapshot(raw);
  templateEntry(conflictingResolution, "neon-hud").slots[0].resolution.assetId = uuid(99);

  for (const [snapshot, code] of [
    [duplicateSlot, "duplicate_slot"],
    [outOfRange, "slot_out_of_range"],
    [duplicateTemplate, "duplicate_snapshot_template"],
    [duplicateSource, "duplicate_source"],
    [incomplete, "missing_snapshot_template"],
    [invalidSite, "invalid_site_id"],
    [invalidVersion, "invalid_template_version"],
    [invalidSource, "invalid_source"],
    [unknownSnapshotTemplate, "unknown_template"],
    [conflictingResolution, "snapshot_conflict"],
  ]) {
    assertInvalid(adaptLegacySiteContentToSiteDocumentV1(raw, snapshot), code);
  }
});

test("rejects snapshot mode that disagrees with raw templateWorks key presence", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);

  const explicitRaw = makeLegacy({ templateWorks: { "cinematic-light": [makeWork(2)] } });
  const explicitMismatch = makeSnapshot(explicitRaw);
  templateEntry(explicitMismatch, "cinematic-light").mode = "fallback";
  templateEntry(explicitMismatch, "cinematic-light").slots[0].source.collection = "works";
  assertInvalid(
    adaptLegacySiteContentToSiteDocumentV1(explicitRaw, explicitMismatch),
    "snapshot_mode_mismatch",
  );

  const fallbackRaw = makeLegacy();
  const fallbackMismatch = makeSnapshot(fallbackRaw);
  templateEntry(fallbackMismatch, "cinematic-light").mode = "explicit";
  templateEntry(fallbackMismatch, "cinematic-light").slots[0].source.collection = "templateWorks";
  assertInvalid(
    adaptLegacySiteContentToSiteDocumentV1(fallbackRaw, fallbackMismatch),
    "snapshot_mode_mismatch",
  );
});

test("distinguishes an explicit empty layout from a missing templateWorks key", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const explicitRaw = makeLegacy({ templateWorks: { "cinematic-light": [] } });
  const fallbackRaw = makeLegacy({ templateWorks: {} });

  const explicitDocument = assertReady(
    adaptLegacySiteContentToSiteDocumentV1(explicitRaw, makeSnapshot(explicitRaw)),
  );
  const fallbackDocument = assertReady(
    adaptLegacySiteContentToSiteDocumentV1(fallbackRaw, makeSnapshot(fallbackRaw)),
  );

  assert.deepEqual(composition(explicitDocument, "cinematic-light"), {
    templateVersion: 1,
    slots: [],
  });
  assert.equal(composition(fallbackDocument, "cinematic-light").slots.length, 1);
  assert.notDeepEqual(explicitDocument, fallbackDocument);
});

test("omits disabled works without creating unresolved diagnostics", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ works: [makeWork(0, { enabled: false })] });
  const result = adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw));
  const document = assertReady(result);

  assert.deepEqual(result.unresolved, []);
  for (const templateId of TEMPLATE_IDS) {
    assert.deepEqual(composition(document, templateId).slots, []);
  }
});

test("rejects snapshot entries for disabled works", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ works: [makeWork(0, { enabled: false })] });
  const snapshot = makeSnapshot(raw);
  templateEntry(snapshot, "cinematic-light").slots = [makeResolvedSlot(0, "fallback")];

  const result = assertInvalid(
    adaptLegacySiteContentToSiteDocumentV1(raw, snapshot),
    "invalid_source",
  );
  assert.deepEqual(result.unresolved, []);
});

test("allows repeated legacy asset references and resolved UUID reuse", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({
    works: [
      makeWork(0, { assetId: "shared-legacy-reference" }),
      makeWork(1, { assetId: "shared-legacy-reference" }),
    ],
  });
  const snapshot = makeSnapshot(raw);
  const cinematic = templateEntry(snapshot, "cinematic-light");
  cinematic.slots = [
    makeResolvedSlot(0, "fallback", 0, 0),
    {
      ...makeResolvedSlot(0, "fallback", 1, 1),
      resolution: { status: "resolved", assetId: uuid(1) },
    },
  ];

  const document = assertReady(
    adaptLegacySiteContentToSiteDocumentV1(raw, snapshot),
  );
  assert.deepEqual(
    composition(document, "cinematic-light").slots.map((slot) => slot.assetId),
    [uuid(1), uuid(1)],
  );
});

test("disabled works do not participate in duplicate legacy layout checks", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({
    works: [
      makeWork(0, { assetId: "disabled-reference", slotIndex: 0, enabled: false }),
      makeWork(1, { assetId: "disabled-reference", slotIndex: 0, enabled: false }),
    ],
  });
  const document = assertReady(
    adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)),
  );
  for (const templateId of TEMPLATE_IDS) {
    assert.deepEqual(composition(document, templateId).slots, []);
  }
});

test("materializes global works fallback compositions for every missing template key", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ templateWorks: {} });
  const document = assertReady(
    adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)),
  );

  assert.deepEqual(Object.keys(document.compositions), TEMPLATE_IDS);
  for (const templateId of TEMPLATE_IDS) {
    assert.equal(composition(document, templateId).slots.length, 1);
    assert.equal(composition(document, templateId).slots[0].locked, false);
  }
});

test("reports raw theme as an aggregated unsupported warning", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ theme: { accent: "#ff6600" } });
  const result = adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw));
  assertReady(result);

  const warning = result.warnings.find((item) => item.code === "unsupported_theme");
  assert.ok(warning);
  assert.deepEqual(warning.paths, ["$.theme"]);
  assert.equal(warning.count, 1);
  assert.equal(JSON.stringify(result.document).includes("theme"), false);
});

test("aggregates dropped work.code and fullWidth warnings with sorted unique paths", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({
    works: [makeWork(0), makeWork(1)],
    templateWorks: { "cinematic-light": [makeWork(2)] },
  });
  const result = adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw));
  assertReady(result);

  const codeWarning = result.warnings.find((item) => item.code === "dropped_work_code");
  const widthWarning = result.warnings.find((item) => item.code === "dropped_full_width");
  assert.equal(codeWarning.count, 3);
  assert.equal(codeWarning.paths.some((pathValue) => pathValue.includes("templateWorks")), true);
  assert.equal(codeWarning.paths.some((pathValue) => pathValue.includes("works[0].code")), true);
  assert.equal(codeWarning.paths.some((pathValue) => pathValue.includes("works[1].code")), true);
  assert.equal(widthWarning.count, 3);
  assert.equal(widthWarning.paths.some((pathValue) => pathValue.includes("templateWorks")), true);
  assert.equal(widthWarning.paths.some((pathValue) => pathValue.includes("works[0].fullWidth")), true);
  assert.equal(widthWarning.paths.some((pathValue) => pathValue.includes("works[1].fullWidth")), true);
  assert.deepEqual(
    result.warnings.map((warning) => warning.code),
    [...result.warnings.map((warning) => warning.code)].sort(),
    "warning groups must be sorted by stable code",
  );
});

test("reports unknown fields and invalid required legacy fields as blocking errors", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ unexpectedRoot: true });
  delete raw.profile.brand;
  raw.contact.email = 42;
  raw.works[0].unexpectedWorkField = "not portable";

  const result = assertInvalid(
    adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)),
  );
  for (const [pathValue, code] of [
    ["$.unexpectedRoot", "unknown_field"],
    ["$.profile.brand", "missing_field"],
    ["$.contact.email", "invalid_type"],
    ["$.works[0].unexpectedWorkField", "unknown_field"],
  ]) {
    assert.ok(
      result.errors.some((error) => error.path === pathValue && error.code === code),
      `expected ${code} at ${pathValue}`,
    );
  }
  assertDiagnosticsSorted(result.errors, "errors");
});

test("rejects unsafe legacy asset references and non-integer dimensions", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  for (const overrides of [
    { assetId: "/photos/private-source.webp" },
    { assetId: "" },
    { assetId: "x".repeat(129) },
    { previewWidth: 1.2 },
    { previewHeight: 0.5 },
    { fullWidth: Number.POSITIVE_INFINITY },
  ]) {
    const raw = makeLegacy({ works: [makeWork(0, overrides)] });
    assertInvalid(
      adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)),
      "invalid_value",
    );
  }
});

test("rejects invalid focus percentages without clamping or fallback", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  for (const position of [
    "-0.01% 50%",
    "100.01% 50%",
    "50% -0.01%",
    "50% 100.01%",
    "50 50",
    "NaN% 50%",
  ]) {
    const raw = makeLegacy({ works: [makeWork(0, { position })] });
    const result = assertInvalid(
      adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw)),
      "invalid_value",
    );
    assert.ok(result.errors.some((error) => error.path === "$.works[0].position"));
    assert.equal("documentPreview" in result, false);
  }
});

test("mixed resolutions return only blocked documentPreview and omit unresolved slots", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({
    works: [makeWork(9)],
    templateWorks: { "cinematic-light": [makeWork(0), makeWork(1)] },
  });
  const snapshot = makeSnapshot(raw);
  const cinematic = templateEntry(snapshot, "cinematic-light");
  cinematic.slots = [
    makeResolvedSlot(0, "explicit", 0, 0),
    {
      source: { collection: "templateWorks", workIndex: 1 },
      slotIndex: 1,
      resolution: { status: "unresolved", reason: "missing_asset_mapping" },
    },
  ];

  const result = adaptLegacySiteContentToSiteDocumentV1(raw, snapshot);
  const preview = assertBlocked(result);
  assert.deepEqual(
    composition(preview, "cinematic-light").slots.map((slot) => slot.slotIndex),
    [0],
  );
  assert.ok(result.unresolved.some((item) => item.code === "missing_asset_mapping"));
  assert.equal(Object.prototype.hasOwnProperty.call(result, "document"), false);
});

test("ready results expose document but never documentPreview", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy();
  const result = adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw));
  assertReady(result);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "document"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "documentPreview"), false);
});

test("ready documents and blocked previews both pass the existing V1 parser", async (t) => {
  const {
    adaptLegacySiteContentToSiteDocumentV1,
    parseSiteDocumentV1,
  } = await importAdapter(t);
  const raw = makeLegacy();
  const readyResult = adaptLegacySiteContentToSiteDocumentV1(raw, makeSnapshot(raw));
  const readyDocument = assertReady(readyResult);
  assert.equal(parseSiteDocumentV1(readyDocument).success, true);

  const blockedRaw = makeLegacy({ templateWorks: { "museum-depth": [makeWork(3)] } });
  const blockedSnapshot = makeSnapshot(blockedRaw);
  templateEntry(blockedSnapshot, "museum-depth").slots[0].resolution = {
    status: "unresolved",
    reason: "missing_source_fingerprint",
  };
  const blockedResult = adaptLegacySiteContentToSiteDocumentV1(blockedRaw, blockedSnapshot);
  const preview = assertBlocked(blockedResult);
  assert.equal(parseSiteDocumentV1(preview).success, true);
});

test("repeated conversion is deterministic and diagnostics are sorted", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({
    theme: { accent: "#ff6600" },
    works: [makeWork(0), makeWork(1), makeWork(2)],
  });
  const snapshot = makeSnapshot(raw);
  const cinematic = templateEntry(snapshot, "cinematic-light");
  cinematic.slots = [
    {
      source: { collection: "works", workIndex: 2 },
      slotIndex: 2,
      resolution: { status: "unresolved", reason: "z_missing" },
    },
    {
      source: { collection: "works", workIndex: 1 },
      slotIndex: 1,
      resolution: { status: "unresolved", reason: "a_missing" },
    },
    makeResolvedSlot(0, "fallback", 0, 0),
  ];

  const first = adaptLegacySiteContentToSiteDocumentV1(raw, snapshot);
  const second = adaptLegacySiteContentToSiteDocumentV1(raw, snapshot);
  assert.deepEqual(second, first);
  assertBlocked(first);
  assertDiagnosticsSorted(first.unresolved, "unresolved diagnostics");
  assert.deepEqual(
    first.warnings.map((warning) => warning.code),
    [...first.warnings.map((warning) => warning.code)].sort(),
  );
});

test("deep-frozen raw input and snapshot remain valid adapter inputs", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = deepFreeze(makeLegacy());
  const snapshot = deepFreeze(makeSnapshot(raw));

  assert.doesNotThrow(() => {
    const result = adaptLegacySiteContentToSiteDocumentV1(raw, snapshot);
    assertReady(result);
  });
});

test("conversion never mutates raw legacy input or the resolution snapshot", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ templateWorks: { "cinematic-light": [makeWork(4)] } });
  const snapshot = makeSnapshot(raw);
  const rawBefore = structuredClone(raw);
  const snapshotBefore = structuredClone(snapshot);

  assertReady(adaptLegacySiteContentToSiteDocumentV1(raw, snapshot));
  assert.deepEqual(raw, rawBefore);
  assert.deepEqual(snapshot, snapshotBefore);
});

test("output documents do not share mutable nested references with either input", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ templateWorks: { "cinematic-light": [makeWork(5)] } });
  const snapshot = makeSnapshot(raw);
  const rawBefore = structuredClone(raw);
  const snapshotBefore = structuredClone(snapshot);
  const document = assertReady(
    adaptLegacySiteContentToSiteDocumentV1(raw, snapshot),
  );

  assert.notEqual(document.profile, raw.profile);
  assert.notEqual(document.hero, raw.hero);
  assert.notEqual(document.trustItems, raw.trustItems);
  assert.notEqual(document.trustItems[0], raw.trustItems[0]);
  assert.notEqual(document.packages, raw.packages);
  assert.notEqual(document.packages[0].deliverables, raw.packages[0].deliverables);
  assert.notEqual(document.compositions, snapshot.templates);
  assert.notEqual(
    composition(document, "cinematic-light").slots[0],
    templateEntry(snapshot, "cinematic-light").slots[0],
  );

  document.profile.brand = "MUTATED OUTPUT";
  document.trustItems[0].value = "MUTATED OUTPUT";
  document.packages[0].deliverables[0] = "MUTATED OUTPUT";
  composition(document, "cinematic-light").slots[0].focus.x = 0;
  assert.deepEqual(raw, rawBefore);
  assert.deepEqual(snapshot, snapshotBefore);
});

test("blocked previews and unresolved diagnostics do not alias either input", async (t) => {
  const { adaptLegacySiteContentToSiteDocumentV1 } = await importAdapter(t);
  const raw = makeLegacy({ templateWorks: { "cinematic-light": [makeWork(6)] } });
  const snapshot = makeSnapshot(raw);
  templateEntry(snapshot, "cinematic-light").slots[0].resolution = {
    status: "unresolved",
    reason: "missing_asset_mapping",
  };
  const rawBefore = structuredClone(raw);
  const snapshotBefore = structuredClone(snapshot);
  const result = adaptLegacySiteContentToSiteDocumentV1(raw, snapshot);
  const preview = assertBlocked(result);

  assert.notEqual(preview.profile, raw.profile);
  assert.notEqual(result.unresolved[0].source, templateEntry(snapshot, "cinematic-light").slots[0].source);
  preview.profile.brand = "MUTATED PREVIEW";
  result.unresolved[0].source.workIndex = 99;
  result.warnings[0].paths.push("$.mutated");
  assert.deepEqual(raw, rawBefore);
  assert.deepEqual(snapshot, snapshotBefore);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const contractPath = fileURLToPath(new URL("../app/site-document.ts", import.meta.url));
const runtimeCatalogPath = fileURLToPath(new URL("../app/templates/catalog.ts", import.meta.url));
const typeFixturePath = fileURLToPath(
  new URL("./fixtures/site-document-contract.type-test.ts", import.meta.url),
);
const FROZEN_V1_TEMPLATE_IDS = [
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
];

async function importContract(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-site-document-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const compile = async (sourcePath, outputPath) => {
    const source = await fs.readFile(sourcePath, "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: path.basename(sourcePath),
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors, [], "the contract must transpile without diagnostics");
    await fs.writeFile(outputPath, result.outputText, "utf8");
  };

  const modulePath = path.join(directory, "site-document.mjs");
  await compile(contractPath, modulePath);
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

function validDocument() {
  return {
    schemaVersion: 1,
    activeTemplate: "cinematic-light",
    profile: {
      brand: "FRAME//ZERO",
      mark: "F//0",
      photographer: "示例摄影师",
      role: "Cosplay 摄影师",
      city: "示例城市",
      availability: "接受预约",
      intro: "用光线讲角色故事。",
    },
    hero: {
      eyebrow: "COSPLAY PHOTOGRAPHY",
      title: "BREAK THE FRAME",
      services: "漫展场照 · 主题私影",
    },
    trustItems: [{ label: "DELIVERY", value: "7–14 天" }],
    packages: [{
      number: "01",
      english: "PRIVATE",
      name: "主题私影",
      description: "从参考到完整叙事。",
      price: "示例价格",
      duration: "2 HOURS",
      deliverables: ["示例交付内容"],
      enabled: true,
    }],
    contact: {
      wechat: "FRAMEZERO_DEMO",
      email: "booking@framezero.example",
      note: "示例联系方式",
    },
    social: [{ label: "示例平台", handle: "@FRAMEZERO_DEMO" }],
    bookingFields: ["角色 / 作品：", "日期："],
    statement: {
      eyebrow: "PHOTOGRAPHY IS NOT PROOF.",
      lineOne: "它是角色",
      lineTwo: "存在过的证据。",
    },
    compositions: {
      "cinematic-light": {
        templateVersion: 1,
        slots: [
          {
            slotIndex: 0,
            assetId: "Asset_A-01",
            locked: false,
            focus: { x: 50, y: 42.5 },
            title: "FRAME 01",
            subtitle: "示例作品",
          },
          {
            slotIndex: 1,
            assetId: "asset_b-02",
            locked: true,
            focus: { x: 20, y: 80 },
          },
        ],
      },
    },
  };
}

function failureIssues(result) {
  assert.equal(result.success, false);
  assert.ok(Array.isArray(result.issues));
  assert.ok(result.issues.length > 0);
  return result.issues;
}

function assertIssue(result, pathValue, code) {
  const issues = failureIssues(result);
  assert.ok(
    issues.some((issue) => issue.path === pathValue && issue.code === code),
    `expected ${code} at ${pathValue}; received ${JSON.stringify(issues)}`,
  );
}

test("the isolated SiteDocumentV1 contract type-checks without the runtime catalog", () => {
  const program = ts.createProgram([contractPath, typeFixturePath], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
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
  assert.equal(
    program.getSourceFiles().some(
      (sourceFile) => path.resolve(sourceFile.fileName).toLowerCase()
        === path.resolve(runtimeCatalogPath).toLowerCase(),
    ),
    false,
    "the TypeScript dependency graph must not include the mutable runtime template catalog",
  );
});

test("accepts a detached, JSON-stable V1 document with opaque asset references", async (t) => {
  const { parseSiteDocumentV1, SITE_DOCUMENT_SCHEMA_VERSION } = await importContract(t);
  const input = validDocument();
  const snapshot = structuredClone(input);

  const result = parseSiteDocumentV1(input);
  assert.equal(result.success, true);
  assert.equal(result.data.schemaVersion, SITE_DOCUMENT_SCHEMA_VERSION);
  assert.deepEqual(result.data, snapshot);
  assert.deepEqual(input, snapshot, "validation must not mutate the caller's document");
  assert.notEqual(result.data, input);
  assert.notEqual(result.data.profile, input.profile);
  assert.equal(result.data.compositions["cinematic-light"].slots[0].assetId, "Asset_A-01");

  const roundTrip = parseSiteDocumentV1(JSON.parse(JSON.stringify(result.data)));
  assert.equal(roundTrip.success, true);
  assert.deepEqual(roundTrip.data, result.data);

  result.data.compositions["cinematic-light"].slots[0].focus.x = 0;
  result.data.packages[0].deliverables[0] = "changed output";
  assert.deepEqual(input, snapshot, "nested output values must not alias the input document");
});

test("strictly rejects missing, malformed, and future schema versions", async (t) => {
  const { parseSiteDocumentV1 } = await importContract(t);
  for (const schemaVersion of [undefined, 0, -1, 2, "1", null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const input = validDocument();
    if (schemaVersion === undefined) delete input.schemaVersion;
    else input.schemaVersion = schemaVersion;
    assertIssue(parseSiteDocumentV1(input), "$.schemaVersion", "unsupported_schema_version");
  }

  for (const input of [null, [], "document", 1, true]) {
    assertIssue(parseSiteDocumentV1(input), "$", "invalid_type");
  }
});

test("requires every V1 root field and accepts exactly the frozen V1 template identities", async (t) => {
  const {
    isSiteDocumentV1TemplateId,
    parseSiteDocumentV1,
    SITE_DOCUMENT_V1_TEMPLATE_IDS,
  } = await importContract(t);
  const requiredFields = [
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
  ];

  for (const field of requiredFields) {
    const input = validDocument();
    delete input[field];
    assert.equal(
      parseSiteDocumentV1(input).success,
      false,
      `missing root field ${field} must be rejected`,
    );
  }

  assert.deepEqual(SITE_DOCUMENT_V1_TEMPLATE_IDS, FROZEN_V1_TEMPLATE_IDS);
  assert.equal(Object.isFrozen(SITE_DOCUMENT_V1_TEMPLATE_IDS), true);
  for (const templateId of FROZEN_V1_TEMPLATE_IDS) {
    const input = validDocument();
    const composition = structuredClone(input.compositions["cinematic-light"]);
    composition.templateVersion = Number.MAX_SAFE_INTEGER;
    composition.slots = [{ ...composition.slots[0], slotIndex: 255 }];
    input.activeTemplate = templateId;
    input.compositions = { [templateId]: composition };

    const result = parseSiteDocumentV1(input);
    assert.equal(result.success, true, `${templateId} must remain valid in schemaVersion 1`);
    assert.equal(result.data.activeTemplate, templateId);
    assert.deepEqual(Object.keys(result.data.compositions), [templateId]);
    assert.equal(isSiteDocumentV1TemplateId(templateId), true);
  }

  const unknownTemplate = validDocument();
  unknownTemplate.activeTemplate = "unknown-template";
  assertIssue(parseSiteDocumentV1(unknownTemplate), "$.activeTemplate", "unknown_template");
  assert.equal(isSiteDocumentV1TemplateId("unknown-template"), false);
  assert.equal(isSiteDocumentV1TemplateId(null), false);
});

test("does not treat the legacy SiteContent shape as an implicit V1 migration", async (t) => {
  const { parseSiteDocumentV1 } = await importContract(t);
  const legacy = validDocument();
  delete legacy.schemaVersion;
  delete legacy.compositions;
  legacy.works = [{ image: "/photos/legacy-full.webp", preview: "/photos/legacy-card.webp" }];
  legacy.templateWorks = {};

  const result = parseSiteDocumentV1(legacy);
  assertIssue(result, "$.schemaVersion", "unsupported_schema_version");
  assertIssue(result, "$.works", "unknown_field");
  assertIssue(result, "$.templateWorks", "unknown_field");
});

test("rejects a legacy platform QR asset at its exact nested V1 path", async (t) => {
  const { parseSiteDocumentV1 } = await importContract(t);
  const input = validDocument();
  input.social[0].qrAssetId = "c".repeat(64);

  assertIssue(
    parseSiteDocumentV1(input),
    "$.social[0].qrAssetId",
    "unknown_field",
  );
});

test("rejects tenant, storage, URL, and legacy work fields instead of silently dropping them", async (t) => {
  const { parseSiteDocumentV1 } = await importContract(t);
  const input = validDocument();
  input.siteId = "source-site";
  input.ownerUserId = "owner-user";
  input.storageKey = "private/original";
  input.works = [];
  input.templateWorks = {};
  input.compositions["cinematic-light"].siteId = "source-site";
  Object.assign(input.compositions["cinematic-light"].slots[0], {
    image: "/photos/full.webp",
    preview: "/photos/card.webp",
    src: "https://cdn.example/photo.webp",
    storageKey: "site/source/original",
    code: "DISPLAY-01",
  });

  const result = parseSiteDocumentV1(input);
  for (const pathValue of [
    "$.siteId",
    "$.ownerUserId",
    "$.storageKey",
    "$.works",
    "$.templateWorks",
    "$.compositions.cinematic-light.siteId",
    "$.compositions.cinematic-light.slots[0].image",
    "$.compositions.cinematic-light.slots[0].preview",
    "$.compositions.cinematic-light.slots[0].src",
    "$.compositions.cinematic-light.slots[0].storageKey",
    "$.compositions.cinematic-light.slots[0].code",
  ]) assertIssue(result, pathValue, "unknown_field");
});

test("rejects invalid or duplicate composition identities without clamping or remapping", async (t) => {
  const { parseSiteDocumentV1 } = await importContract(t);

  const invalidAssetIds = [
    "",
    "   ",
    "asset\u0000one",
    "asset\u001bone",
    "asset\u0085one",
    "asset\none",
    "x".repeat(2_049),
  ];
  for (const assetId of invalidAssetIds) {
    const input = validDocument();
    input.compositions["cinematic-light"].slots[0].assetId = assetId;
    assertIssue(
      parseSiteDocumentV1(input),
      "$.compositions.cinematic-light.slots[0].assetId",
      "invalid_value",
    );
  }

  for (const assetId of [undefined, null, 1, true]) {
    const input = validDocument();
    input.compositions["cinematic-light"].slots[0].assetId = assetId;
    assertIssue(
      parseSiteDocumentV1(input),
      "$.compositions.cinematic-light.slots[0].assetId",
      "invalid_type",
    );
  }

  for (const assetId of [
    "sha256:ab.cd+ef",
    "asset/one",
    "asset\\one",
    "https://example.invalid/opaque-id",
  ]) {
    const opaqueAssetId = validDocument();
    opaqueAssetId.compositions["cinematic-light"].slots[0].assetId = assetId;
    assert.equal(
      parseSiteDocumentV1(opaqueAssetId).success,
      true,
      "the contract must not infer a public Asset ID encoding",
    );
  }

  for (const slotIndex of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const input = validDocument();
    input.compositions["cinematic-light"].slots[0].slotIndex = slotIndex;
    assertIssue(
      parseSiteDocumentV1(input),
      "$.compositions.cinematic-light.slots[0].slotIndex",
      "invalid_value",
    );
  }

  const lastStructuralSlot = validDocument();
  lastStructuralSlot.compositions["cinematic-light"].slots = [{
    ...lastStructuralSlot.compositions["cinematic-light"].slots[0],
    slotIndex: 255,
  }];
  assert.equal(parseSiteDocumentV1(lastStructuralSlot).success, true);

  const outOfRangeSlot = validDocument();
  outOfRangeSlot.compositions["cinematic-light"].slots[0].slotIndex = 256;
  assertIssue(
    parseSiteDocumentV1(outOfRangeSlot),
    "$.compositions.cinematic-light.slots[0].slotIndex",
    "invalid_value",
  );

  for (const templateVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const input = validDocument();
    input.compositions["cinematic-light"].templateVersion = templateVersion;
    assertIssue(
      parseSiteDocumentV1(input),
      "$.compositions.cinematic-light.templateVersion",
      "invalid_value",
    );
  }

  const duplicateSlotIndex = validDocument();
  duplicateSlotIndex.compositions["cinematic-light"].slots[1].slotIndex = 0;
  const duplicateResult = parseSiteDocumentV1(duplicateSlotIndex);
  assertIssue(
    duplicateResult,
    "$.compositions.cinematic-light.slots[1].slotIndex",
    "duplicate_reference",
  );

  const repeatedAsset = validDocument();
  repeatedAsset.compositions["cinematic-light"].slots[1].assetId = "Asset_A-01";
  assert.equal(
    parseSiteDocumentV1(repeatedAsset).success,
    true,
    "manual compositions may intentionally reuse an asset",
  );

  const unknownTemplate = validDocument();
  unknownTemplate.compositions["unknown-template"] = unknownTemplate.compositions["cinematic-light"];
  assertIssue(
    parseSiteDocumentV1(unknownTemplate),
    "$.compositions.unknown-template",
    "unknown_template",
  );
});

test("rejects invalid presentation fields and leaves theme overrides unsupported", async (t) => {
  const { parseSiteDocumentV1 } = await importContract(t);
  const input = validDocument();
  input.compositions["cinematic-light"].slots[0].focus.x = -0.01;
  input.compositions["cinematic-light"].slots[1].focus.y = 100.01;
  delete input.compositions["cinematic-light"].slots[1].locked;
  input.compositions["cinematic-light"].slots[0].title = "x".repeat(2_049);
  input.theme = { accent: "#ff6b00" };

  const result = parseSiteDocumentV1(input);
  assertIssue(result, "$.compositions.cinematic-light.slots[0].focus.x", "invalid_value");
  assertIssue(result, "$.compositions.cinematic-light.slots[1].focus.y", "invalid_value");
  assertIssue(result, "$.compositions.cinematic-light.slots[1].locked", "invalid_type");
  assertIssue(result, "$.compositions.cinematic-light.slots[0].title", "limit_exceeded");
  assertIssue(result, "$.theme", "unsupported_field");
});

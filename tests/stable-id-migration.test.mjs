import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const contractPath = new URL("../app/stable-id-migration.ts", import.meta.url);
const siteDocumentPath = new URL("../app/site-document.ts", import.meta.url);
const typeFixturePath = new URL("./fixtures/stable-id-migration.type-test.ts", import.meta.url);

const SITE_A = "11111111-1111-4111-8111-111111111111";
const SITE_B = "22222222-2222-4222-8222-222222222222";
const ASSET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSET_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FINGERPRINT_A = "a".repeat(64);
const FINGERPRINT_B = "b".repeat(64);

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
}

async function importContract(t) {
  const [source, siteDocumentSource] = await Promise.all([
    fs.readFile(contractPath, "utf8"),
    fs.readFile(siteDocumentPath, "utf8"),
  ]);
  const compiled = transpile(source, "stable-id-migration.ts");
  const rewritten = compiled.replace(
    'from "./site-document";',
    'from "./site-document.mjs";',
  );
  assert.notEqual(rewritten, compiled, "the runtime template validator import must be linked");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-stable-id-"));
  const modulePath = path.join(directory, "stable-id-migration.mjs");
  const siteDocumentModulePath = path.join(directory, "site-document.mjs");
  await Promise.all([
    fs.writeFile(modulePath, rewritten, "utf8"),
    fs.writeFile(siteDocumentModulePath, transpile(siteDocumentSource, "site-document.ts"), "utf8"),
  ]);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const [contract, siteDocument] = await Promise.all([
    import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`),
    import(pathToFileURL(siteDocumentModulePath).href),
  ]);
  return {
    ...contract,
    SITE_DOCUMENT_V1_TEMPLATE_IDS: siteDocument.SITE_DOCUMENT_V1_TEMPLATE_IDS,
  };
}

function checkpoint(siteId, status = "pending") {
  return {
    migrationKey: "legacy:site_settings:1",
    siteId,
    status,
  };
}

function slot(slotIndex, sourceFingerprint, templateId = "cinematic-light") {
  return {
    slot: { templateId, templateVersion: 1, slotIndex },
    sourceFingerprint,
  };
}

function generator(...values) {
  let index = 0;
  const calls = [];
  const generate = (...args) => {
    calls.push(args);
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error("unexpected UUID allocation");
    return value;
  };
  return { calls, generate };
}

function assertConflictWithoutCompletion(result, expectedCode) {
  assert.equal(result.success, false);
  assert.ok(result.conflicts.some((conflict) => conflict.code === expectedCode));
  assert.equal("plan" in result, false, "conflicts must not expose a completion plan");
  assert.equal(JSON.stringify(result).includes("nextCheckpoint"), false);
}

test("the TypeScript contract keeps migration, Site, Asset, and slot identities separate", () => {
  const options = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const program = ts.createProgram({
    options,
    rootNames: [fileURLToPath(contractPath), fileURLToPath(typeFixturePath)],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
  );
});

test("dry-run never allocates or persists a temporary Site ID", async (t) => {
  const { planLegacySiteMigrationStart } = await importContract(t);
  const ids = generator();
  const result = planLegacySiteMigrationStart(
    { mode: "dry-run", persistedCheckpoints: [] },
    ids.generate,
  );

  assert.deepEqual(result, {
    success: true,
    plan: {
      action: "dry-run",
      migrationKey: "legacy:site_settings:1",
      persistedStatus: null,
      siteId: null,
    },
  });
  assert.equal(ids.calls.length, 0);
});

test("first apply allocates UUID v4 without derivation and stops at persist-pending", async (t) => {
  const {
    LEGACY_SITE_SETTINGS_MIGRATION_KEY,
    planLegacySiteMigrationStart,
  } = await importContract(t);
  const ids = generator(SITE_A);
  const result = planLegacySiteMigrationStart(
    { mode: "apply", persistedCheckpoints: [] },
    ids.generate,
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.plan, {
    action: "persist-pending",
    checkpoint: checkpoint(SITE_A),
    migrationKey: LEGACY_SITE_SETTINGS_MIGRATION_KEY,
    siteId: SITE_A,
  });
  assert.deepEqual(ids.calls, [[]], "the UUID factory must receive no slug, domain, user, path, or hash input");
  assert.equal("assetPlan" in result.plan, false, "asset planning must wait for a persisted pending checkpoint");
});

test("pending retries reuse Site ID and completed retries are stable no-ops", async (t) => {
  const { planLegacySiteMigrationStart } = await importContract(t);
  const ids = generator();

  const resumed = planLegacySiteMigrationStart(
    { mode: "apply", persistedCheckpoints: [checkpoint(SITE_A)] },
    ids.generate,
  );
  const completedInput = { mode: "apply", persistedCheckpoints: [checkpoint(SITE_A, "completed")] };
  const completed = planLegacySiteMigrationStart(completedInput, ids.generate);
  const repeated = planLegacySiteMigrationStart(completedInput, ids.generate);

  assert.deepEqual(resumed, {
    success: true,
    plan: {
      action: "resume",
      checkpoint: checkpoint(SITE_A),
      migrationKey: "legacy:site_settings:1",
      siteId: SITE_A,
    },
  });
  assert.deepEqual(completed, repeated);
  assert.equal(completed.success, true);
  assert.equal(completed.plan.action, "noop");
  assert.equal(completed.plan.siteId, SITE_A);
  assert.equal(ids.calls.length, 0);
});

test("invalid modes and checkpoints fail without producing a completion plan", async (t) => {
  const { planLegacySiteMigrationStart } = await importContract(t);
  const ids = generator("not-a-uuid");

  const cases = [
    {
      expected: "invalid_migration_mode",
      input: { mode: "preview", persistedCheckpoints: [] },
    },
    {
      expected: "duplicate_checkpoint",
      input: { mode: "apply", persistedCheckpoints: [checkpoint(SITE_A), checkpoint(SITE_B)] },
    },
    {
      expected: "migration_key_mismatch",
      input: {
        mode: "apply",
        persistedCheckpoints: [{ ...checkpoint(SITE_A), migrationKey: "legacy:site_settings:2" }],
      },
    },
    {
      expected: "invalid_site_id",
      input: { mode: "apply", persistedCheckpoints: [checkpoint("site-from-slug")] },
    },
    {
      expected: "invalid_checkpoint_status",
      input: { mode: "apply", persistedCheckpoints: [checkpoint(SITE_A, "failed")] },
    },
  ];

  for (const { expected, input } of cases) {
    const result = planLegacySiteMigrationStart(input, ids.generate);
    assertConflictWithoutCompletion(result, expected);
  }

  const invalidGenerated = planLegacySiteMigrationStart(
    { mode: "apply", persistedCheckpoints: [] },
    ids.generate,
  );
  assertConflictWithoutCompletion(invalidGenerated, "invalid_generated_site_id");
});

test("every frozen V1 template identity can plan a completed checkpoint", async (t) => {
  const {
    SITE_DOCUMENT_V1_TEMPLATE_IDS,
    planLegacyAssetMigration,
  } = await importContract(t);
  const ids = generator();
  const result = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A),
    candidates: SITE_DOCUMENT_V1_TEMPLATE_IDS.map((templateId, slotIndex) => (
      slot(slotIndex, FINGERPRINT_A, templateId)
    )),
    persistedMappings: [{ siteId: SITE_A, sourceFingerprint: FINGERPRINT_A, assetId: ASSET_A }],
  }, ids.generate);

  assert.equal(result.success, true);
  assert.equal(result.plan.action, "map-assets");
  assert.deepEqual(
    result.plan.assignments.map(({ slot: assignedSlot, disposition }) => ({
      templateId: assignedSlot.templateId,
      disposition,
    })),
    SITE_DOCUMENT_V1_TEMPLATE_IDS.map((templateId) => ({
      templateId,
      disposition: "reused",
    })),
  );
  assert.deepEqual(result.plan.completion, {
    status: "ready-to-complete",
    nextCheckpoint: checkpoint(SITE_A, "completed"),
  });
  assert.equal(ids.calls.length, 0);
});

test("unknown template identities fail before Asset UUID allocation", async (t) => {
  const { planLegacyAssetMigration } = await importContract(t);
  const ids = generator(ASSET_A);
  const result = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A),
    candidates: [slot(0, FINGERPRINT_A, "unknown-template")],
    persistedMappings: [],
  }, ids.generate);

  assertConflictWithoutCompletion(result, "invalid_slot_identity");
  assert.equal(ids.calls.length, 0);
});

test("same-Site fingerprints reuse mappings while new fingerprints receive random Asset IDs", async (t) => {
  const { planLegacyAssetMigration } = await importContract(t);
  const ids = generator(ASSET_B);
  const result = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A),
    candidates: [
      slot(0, FINGERPRINT_A),
      slot(1, FINGERPRINT_A),
      slot(2, FINGERPRINT_B),
    ],
    persistedMappings: [{ siteId: SITE_A, sourceFingerprint: FINGERPRINT_A, assetId: ASSET_A }],
  }, ids.generate);

  assert.equal(result.success, true);
  assert.equal(result.plan.action, "map-assets");
  assert.deepEqual(result.plan.assignments.map(({ assetId, disposition }) => ({ assetId, disposition })), [
    { assetId: ASSET_A, disposition: "reused" },
    { assetId: ASSET_A, disposition: "reused" },
    { assetId: ASSET_B, disposition: "generated" },
  ]);
  assert.deepEqual(result.plan.newMappings, [
    { siteId: SITE_A, sourceFingerprint: FINGERPRINT_B, assetId: ASSET_B },
  ]);
  assert.deepEqual(ids.calls, [[]]);
  assert.equal(result.plan.assignments.some((assignment) => assignment.assetId === FINGERPRINT_A), false);
});

test("the same fingerprint in different Sites receives different Asset IDs", async (t) => {
  const { planLegacyAssetMigration } = await importContract(t);
  const ids = generator(ASSET_B);
  const result = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_B),
    candidates: [slot(0, FINGERPRINT_A)],
    persistedMappings: [{ siteId: SITE_A, sourceFingerprint: FINGERPRINT_A, assetId: ASSET_A }],
  }, ids.generate);

  assert.equal(result.success, true);
  assert.equal(result.plan.assignments[0].assetId, ASSET_B);
  assert.equal(result.plan.assignments[0].disposition, "generated");
  assert.notEqual(result.plan.assignments[0].assetId, ASSET_A);
});

test("unresolved assets block completion and retries keep the pending Site ID", async (t) => {
  const {
    planLegacyAssetMigration,
    planLegacySiteMigrationStart,
  } = await importContract(t);
  const ids = generator();
  const candidate = slot(7, null, "museum-depth");
  const pendingCheckpoint = checkpoint(SITE_A);
  const result = planLegacyAssetMigration({
    checkpoint: pendingCheckpoint,
    candidates: [candidate],
    persistedMappings: [],
  }, ids.generate);

  assert.deepEqual(result, {
    success: true,
    plan: {
      action: "map-assets",
      assignments: [],
      completion: {
        status: "blocked-by-unresolved",
        nextCheckpoint: null,
      },
      migrationKey: "legacy:site_settings:1",
      newMappings: [],
      siteId: SITE_A,
      unresolved: [{ slot: candidate.slot, reason: "missing_source_fingerprint" }],
    },
  });

  const resumed = planLegacySiteMigrationStart(
    { mode: "apply", persistedCheckpoints: [pendingCheckpoint] },
    ids.generate,
  );
  assert.equal(resumed.success, true);
  assert.equal(resumed.plan.action, "resume");
  assert.equal(resumed.plan.siteId, SITE_A);

  const retried = planLegacyAssetMigration({
    checkpoint: pendingCheckpoint,
    candidates: [candidate],
    persistedMappings: [],
  }, ids.generate);
  assert.deepEqual(retried, result);
  assert.deepEqual(pendingCheckpoint, checkpoint(SITE_A), "blocked completion must remain pending");
  assert.equal(ids.calls.length, 0);
});

test("persisted mappings make failure recovery idempotent", async (t) => {
  const { planLegacyAssetMigration } = await importContract(t);
  const initialIds = generator(ASSET_C);
  const initial = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A),
    candidates: [slot(3, FINGERPRINT_B)],
    persistedMappings: [],
  }, initialIds.generate);
  assert.equal(initial.success, true);

  const retryIds = generator();
  const retried = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A),
    candidates: [slot(3, FINGERPRINT_B)],
    persistedMappings: initial.plan.newMappings,
  }, retryIds.generate);

  assert.equal(retried.success, true);
  assert.equal(retried.plan.assignments[0].assetId, ASSET_C);
  assert.equal(retried.plan.assignments[0].disposition, "reused");
  assert.deepEqual(retried.plan.newMappings, []);
  assert.equal(retryIds.calls.length, 0);
});

test("UUID allocation failures return conflicts and a clean retry can resume", async (t) => {
  const {
    planLegacyAssetMigration,
    planLegacySiteMigrationStart,
  } = await importContract(t);

  const failedSite = planLegacySiteMigrationStart(
    { mode: "apply", persistedCheckpoints: [] },
    () => { throw new Error("secure random source unavailable"); },
  );
  assertConflictWithoutCompletion(failedSite, "site_id_generation_failed");

  const retriedSite = planLegacySiteMigrationStart(
    { mode: "apply", persistedCheckpoints: [] },
    () => SITE_A,
  );
  assert.equal(retriedSite.success, true);
  assert.equal(retriedSite.plan.action, "persist-pending");
  assert.equal(retriedSite.plan.siteId, SITE_A);

  const migrationInput = {
    checkpoint: checkpoint(SITE_A),
    candidates: [slot(4, FINGERPRINT_A)],
    persistedMappings: [],
  };
  const failedAsset = planLegacyAssetMigration(
    migrationInput,
    () => { throw new Error("secure random source unavailable"); },
  );
  assertConflictWithoutCompletion(failedAsset, "asset_id_generation_failed");

  const invalidAsset = planLegacyAssetMigration(migrationInput, () => FINGERPRINT_A);
  assertConflictWithoutCompletion(invalidAsset, "invalid_generated_asset_id");

  const retriedAsset = planLegacyAssetMigration(migrationInput, () => ASSET_A);
  assert.equal(retriedAsset.success, true);
  assert.equal(retriedAsset.plan.assignments[0].assetId, ASSET_A);
  assert.equal(retriedAsset.plan.assignments[0].disposition, "generated");
});

test("mapping and slot conflicts fail without allocating another identity", async (t) => {
  const { planLegacyAssetMigration } = await importContract(t);
  const ids = generator();
  const cases = [
    {
      code: "fingerprint_mapping_conflict",
      input: {
        checkpoint: checkpoint(SITE_A),
        candidates: [slot(0, FINGERPRINT_A)],
        persistedMappings: [
          { siteId: SITE_A, sourceFingerprint: FINGERPRINT_A, assetId: ASSET_A },
          { siteId: SITE_A, sourceFingerprint: FINGERPRINT_A, assetId: ASSET_B },
        ],
      },
    },
    {
      code: "asset_mapping_conflict",
      input: {
        checkpoint: checkpoint(SITE_A),
        candidates: [slot(0, FINGERPRINT_A)],
        persistedMappings: [
          { siteId: SITE_A, sourceFingerprint: FINGERPRINT_A, assetId: ASSET_A },
          { siteId: SITE_A, sourceFingerprint: FINGERPRINT_B, assetId: ASSET_A },
        ],
      },
    },
    {
      code: "duplicate_slot",
      input: {
        checkpoint: checkpoint(SITE_A),
        candidates: [slot(0, FINGERPRINT_A), slot(0, FINGERPRINT_B)],
        persistedMappings: [],
      },
    },
    {
      code: "invalid_source_fingerprint",
      input: {
        checkpoint: checkpoint(SITE_A),
        candidates: [slot(0, "private-file-name.jpg")],
        persistedMappings: [],
      },
    },
    {
      code: "invalid_asset_id",
      input: {
        checkpoint: checkpoint(SITE_A),
        candidates: [slot(0, FINGERPRINT_A)],
        persistedMappings: [
          { siteId: SITE_A, sourceFingerprint: FINGERPRINT_A, assetId: "asset-from-path" },
        ],
      },
    },
  ];

  for (const { code, input } of cases) {
    const result = planLegacyAssetMigration(input, ids.generate);
    assertConflictWithoutCompletion(result, code);
  }
  assert.equal(ids.calls.length, 0);

  const collidingIds = generator(ASSET_A);
  const generatedCollision = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A),
    candidates: [slot(0, FINGERPRINT_B)],
    persistedMappings: [
      { siteId: SITE_A, sourceFingerprint: FINGERPRINT_A, assetId: ASSET_A },
    ],
  }, collidingIds.generate);
  assertConflictWithoutCompletion(generatedCollision, "asset_mapping_conflict");
  assert.equal(collidingIds.calls.length, 1);
});

test("completed checkpoints produce stable no-ops on every retry", async (t) => {
  const { planLegacyAssetMigration } = await importContract(t);
  const ids = generator();
  const ready = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A),
    candidates: [],
    persistedMappings: [],
  }, ids.generate);
  assert.equal(ready.success, true);
  assert.equal(ready.plan.completion.status, "ready-to-complete");

  const completedCheckpoint = ready.plan.completion.nextCheckpoint;
  const result = planLegacyAssetMigration({
    checkpoint: completedCheckpoint,
    candidates: [slot(0, FINGERPRINT_A)],
    persistedMappings: [],
  }, ids.generate);
  const repeated = planLegacyAssetMigration({
    checkpoint: completedCheckpoint,
    candidates: [slot(0, FINGERPRINT_A)],
    persistedMappings: [],
  }, ids.generate);

  assert.deepEqual(result, {
    success: true,
    plan: {
      action: "noop",
      migrationKey: "legacy:site_settings:1",
      siteId: SITE_A,
    },
  });
  assert.deepEqual(repeated, result);
  assert.equal(ids.calls.length, 0);
});

test("the default generator returns distinct RFC 4122 UUID v4 values", async (t) => {
  const { generateUuidV4, isUuidV4 } = await importContract(t);
  const values = Array.from({ length: 16 }, () => generateUuidV4());
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every(isUuidV4));
  assert.equal(isUuidV4("legacy:site_settings:1"), false);
  assert.equal(isUuidV4(FINGERPRINT_A), false);
});

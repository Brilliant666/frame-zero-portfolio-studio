import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const contractPath = new URL("../app/stable-id-migration.ts", import.meta.url);
const typeFixturePath = new URL("./fixtures/stable-id-migration.type-test.ts", import.meta.url);

const SITE_A = "11111111-1111-4111-8111-111111111111";
const SITE_B = "22222222-2222-4222-8222-222222222222";
const ASSET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSET_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FINGERPRINT_A = "a".repeat(64);
const FINGERPRINT_B = "b".repeat(64);

async function importContract(t) {
  const source = await fs.readFile(contractPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "stable-id-migration.ts",
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-stable-id-"));
  const modulePath = path.join(directory, "stable-id-migration.mjs");
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
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

test("duplicate, mismatched, invalid, and non-v4 checkpoints fail as conflicts", async (t) => {
  const { planLegacySiteMigrationStart } = await importContract(t);
  const ids = generator("not-a-uuid");

  const cases = [
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
    assert.equal(result.success, false);
    assert.ok(result.conflicts.some((conflict) => conflict.code === expected));
  }

  const invalidGenerated = planLegacySiteMigrationStart(
    { mode: "apply", persistedCheckpoints: [] },
    ids.generate,
  );
  assert.equal(invalidGenerated.success, false);
  assert.equal(invalidGenerated.conflicts[0].code, "invalid_generated_site_id");
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

test("missing fingerprints stay unresolved and never allocate path-derived IDs", async (t) => {
  const { planLegacyAssetMigration } = await importContract(t);
  const ids = generator();
  const candidate = slot(7, null, "museum-depth");
  const result = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A),
    candidates: [candidate],
    persistedMappings: [],
  }, ids.generate);

  assert.deepEqual(result, {
    success: true,
    plan: {
      action: "map-assets",
      assignments: [],
      migrationKey: "legacy:site_settings:1",
      newMappings: [],
      siteId: SITE_A,
      unresolved: [{ slot: candidate.slot, reason: "missing_source_fingerprint" }],
    },
  });
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
  assert.equal(failedSite.success, false);
  assert.equal(failedSite.conflicts[0].code, "site_id_generation_failed");

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
  assert.equal(failedAsset.success, false);
  assert.equal(failedAsset.conflicts[0].code, "asset_id_generation_failed");

  const invalidAsset = planLegacyAssetMigration(migrationInput, () => FINGERPRINT_A);
  assert.equal(invalidAsset.success, false);
  assert.equal(invalidAsset.conflicts[0].code, "invalid_generated_asset_id");

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
  ];

  for (const { code, input } of cases) {
    const result = planLegacyAssetMigration(input, ids.generate);
    assert.equal(result.success, false);
    assert.ok(result.conflicts.some((conflict) => conflict.code === code));
  }
  assert.equal(ids.calls.length, 0);
});

test("completed migrations cannot create another asset plan", async (t) => {
  const { planLegacyAssetMigration } = await importContract(t);
  const ids = generator();
  const result = planLegacyAssetMigration({
    checkpoint: checkpoint(SITE_A, "completed"),
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

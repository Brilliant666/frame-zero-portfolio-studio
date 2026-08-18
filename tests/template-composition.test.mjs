import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const typeFixturePath = fileURLToPath(
  new URL("./fixtures/template-composition.type-test.ts", import.meta.url),
);
const compositionSources = ["contract", "assignment", "planner", "index"];

let composition;
let templateCatalog;
let legacyLibrary;
let compiledDirectory;

function diagnosticsText(diagnostics) {
  return diagnostics.map((diagnostic) => {
    const location = diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
    const prefix = diagnostic.file && location
      ? `${path.relative(repositoryRoot, diagnostic.file.fileName)}:${location.line + 1}:${location.character + 1}`
      : "TypeScript";
    return `${prefix}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
  });
}

async function transpileTo(sourceRelativePath, outputName) {
  const sourcePath = path.join(repositoryRoot, sourceRelativePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path.basename(sourcePath),
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(diagnosticsText(errors), [], `${sourceRelativePath} must transpile`);
  const output = result.outputText
    .replaceAll('from "./contract"', 'from "./contract.js"')
    .replaceAll('from "./assignment"', 'from "./assignment.js"')
    .replaceAll('from "./planner"', 'from "./planner.js"')
    .replaceAll('from "../photo-ratio-policy"', 'from "./photo-ratio-policy.js"')
    .replaceAll('from "./photo-ratio-policy"', 'from "./photo-ratio-policy.js"');
  await fs.writeFile(path.join(compiledDirectory, outputName), output, "utf8");
}

test.before(async () => {
  compiledDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-composition-test-"));
  await fs.writeFile(
    path.join(compiledDirectory, "package.json"),
    JSON.stringify({ type: "module" }),
    "utf8",
  );
  await Promise.all([
    ...compositionSources.map((name) => transpileTo(
      `app/template-composition/${name}.ts`,
      `${name}.js`,
    )),
    transpileTo("app/templates/catalog.ts", "catalog.js"),
    transpileTo("app/photo-ratio-policy.ts", "photo-ratio-policy.js"),
    transpileTo("app/photo-library.ts", "photo-library.js"),
  ]);
  const cacheKey = `${Date.now()}-${Math.random()}`;
  [composition, { templateCatalog }, legacyLibrary] = await Promise.all([
    import(`${pathToFileURL(path.join(compiledDirectory, "index.js")).href}?test=${cacheKey}`),
    import(`${pathToFileURL(path.join(compiledDirectory, "catalog.js")).href}?test=${cacheKey}`),
    import(`${pathToFileURL(path.join(compiledDirectory, "photo-library.js")).href}?test=${cacheKey}`),
  ]);
});

test.after(async () => {
  if (compiledDirectory) await fs.rm(compiledDirectory, { recursive: true, force: true });
});

function orientationForRatio(aspectRatio) {
  if (aspectRatio > 1) return "landscape";
  if (aspectRatio < 1) return "portrait";
  return "square";
}

function asset(assetId, aspectRatio, orientation = orientationForRatio(aspectRatio)) {
  return { assetId, aspectRatio, orientation };
}

function legacyAsset(assetId, aspectRatio, orientation = orientationForRatio(aspectRatio)) {
  const dimensions = aspectRatio >= 1
    ? { width: Math.round(aspectRatio * 1_000), height: 1_000 }
    : { width: 1_000, height: Math.round(1_000 / aspectRatio) };
  const makeVariant = (name, scale) => ({
    src: `/photos/library/${assetId}-${name}.webp`,
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
    bytes: 1_000,
  });
  return {
    id: assetId,
    aspectRatio,
    orientation,
    variants: {
      thumbnail: makeVariant("thumbnail", 0.25),
      card: makeVariant("card", 0.5),
      full: makeVariant("full", 1),
    },
  };
}

function makeSlot(slotIndex, assignmentRatio, options = {}) {
  return {
    slotIndex,
    slotKey: `slot-${slotIndex}`,
    logicalRole: `role-${slotIndex}`,
    assignmentRatio,
    critical: options.critical ?? false,
    secondaryPresentations: options.secondaryPresentations ?? [],
  };
}

function makeVariant(variantId, ratios, options = {}) {
  const criticalIndexes = new Set(options.criticalIndexes ?? []);
  return {
    variantId,
    fallbackPriority: options.fallbackPriority ?? 0,
    slots: ratios.map((ratio, slotIndex) => makeSlot(slotIndex, ratio, {
      critical: criticalIndexes.has(slotIndex),
      secondaryPresentations: options.secondaryBySlot?.[slotIndex] ?? [],
    })),
  };
}

function makeRegistry(variants, options = {}) {
  return {
    templateId: options.templateId ?? "synthetic-template",
    templateVersion: options.templateVersion ?? 1,
    variants,
  };
}

function assertAssigned(result) {
  assert.equal(result.status, "assigned", JSON.stringify(result));
  return result;
}

function assertBlocked(result) {
  assert.equal(result.status, "blocked", JSON.stringify(result));
  return result;
}

function assertPlanned(result) {
  assert.equal(result.status, "planned", JSON.stringify(result));
  return result;
}

function assertInvalid(result) {
  assert.equal(result.status, "invalid", JSON.stringify(result));
  return result;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ("value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function ids(result) {
  return result.assignments.map((assignment) => assignment.assetId);
}

function ratioValue(ratio) {
  if (ratio === "3:2") return 3 / 2;
  if (ratio === "2:3") return 2 / 3;
  return 16 / 9;
}

test("the public TypeScript contract type-checks as an isolated pure dependency graph", () => {
  const program = ts.createProgram([typeFixturePath], {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    lib: ["lib.es2022.d.ts"],
  });
  const errors = ts.getPreEmitDiagnostics(program).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(diagnosticsText(errors), []);
});

test("strict registry validation clones, freezes, and derives statistics without drift", () => {
  const raw = makeRegistry([
    makeVariant("classic", ["3:2", "2:3", "16:9"], { fallbackPriority: 0 }),
    makeVariant("alternate", ["16:9", "2:3", "3:2"], { fallbackPriority: 1 }),
  ]);
  const result = composition.validateCompositionVariantRegistry(raw);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.notEqual(result.registry, raw);
  assert.notEqual(result.registry.variants, raw.variants);
  assert.notEqual(result.registry.variants[0].slots, raw.variants[0].slots);
  assert.ok(Object.isFrozen(result.registry));
  assert.ok(Object.isFrozen(result.registry.variants));
  assert.ok(Object.isFrozen(result.registry.variants[0].slots));

  raw.variants[0].slots[0].assignmentRatio = "16:9";
  assert.equal(result.registry.variants[0].slots[0].assignmentRatio, "3:2");
  assert.deepEqual(composition.deriveVariantStatistics(result.registry.variants[0]), {
    slotCount: 3,
    landscapeCount: 2,
    portraitCount: 1,
    ratioCounts: { "3:2": 1, "2:3": 1, "16:9": 1 },
  });
});

test("strict registry invariants fail closed with deterministic issue codes", async (t) => {
  const cases = [
    ["non-canonical variant identity", (raw) => { raw.variants[0].variantId = "Classic"; }, "invalid_stable_id"],
    ["duplicate variant identity", (raw) => { raw.variants[1].variantId = raw.variants[0].variantId; }, "duplicate_variant_id"],
    ["ambiguous fallback", (raw) => { raw.variants[1].fallbackPriority = 0; }, "ambiguous_fallback_priority"],
    ["non-contiguous slot", (raw) => { raw.variants[0].slots[1].slotIndex = 0; }, "slot_index_not_contiguous"],
    ["slot count change", (raw) => { raw.variants[1].slots.pop(); }, "slot_count_changed"],
    ["logical role change", (raw) => { raw.variants[1].slots[0].logicalRole = "different-role"; }, "logical_slot_identity_changed"],
    ["critical identity change", (raw) => { raw.variants[1].slots[0].critical = true; }, "logical_slot_identity_changed"],
    ["duplicate slot key", (raw) => { raw.variants[0].slots[1].slotKey = raw.variants[0].slots[0].slotKey; }, "duplicate_slot_key"],
    ["unsupported assignment ratio", (raw) => { raw.variants[0].slots[0].assignmentRatio = "1:1"; }, "invalid_ratio"],
    ["unsupported secondary ratio", (raw) => { raw.variants[0].slots[0].secondaryPresentations = [{ presentationKey: "stage", ratio: "1:1", critical: true }]; }, "invalid_ratio"],
    ["duplicate secondary identity", (raw) => { raw.variants[0].slots[0].secondaryPresentations = [{ presentationKey: "stage", ratio: "3:2", critical: true }, { presentationKey: "stage", ratio: "16:9", critical: false }]; }, "duplicate_presentation_key"],
    ["non-finite fallback", (raw) => { raw.variants[0].fallbackPriority = Number.POSITIVE_INFINITY; }, "invalid_integer"],
    ["non-finite template version", (raw) => { raw.templateVersion = Number.NaN; }, "invalid_integer"],
    ["unknown field", (raw) => { raw.variants[0].runtimeLayout = "forbidden"; }, "unknown_field"],
  ];

  for (const [name, mutate, expectedCode] of cases) {
    await t.test(name, () => {
      const raw = makeRegistry([
        makeVariant("classic", ["3:2", "2:3"], { fallbackPriority: 0 }),
        makeVariant("alternate", ["16:9", "2:3"], { fallbackPriority: 1 }),
      ]);
      mutate(raw);
      const first = composition.validateCompositionVariantRegistry(raw);
      const second = composition.validateCompositionVariantRegistry(raw);
      assert.equal(first.ok, false);
      assert.ok(first.errors.some((issue) => issue.code === expectedCode), JSON.stringify(first));
      assert.deepEqual(second, first);
      assert.deepEqual(first.errors, [...first.errors].sort((left, right) => (
        left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message)
      )));
    });
  }
});

test("malicious registry arrays, accessors, symbols, prototypes, and proxies never execute or throw", async (t) => {
  await t.test("array index getter", () => {
    let getterCalls = 0;
    const variants = [];
    Object.defineProperty(variants, "0", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      },
    });
    variants.length = 1;
    const result = composition.validateCompositionVariantRegistry(makeRegistry(variants));
    assert.equal(result.ok, false);
    assert.equal(getterCalls, 0);
    assert.ok(result.errors.some((issue) => issue.code === "accessor_property"));
  });

  await t.test("throwing array proxy", () => {
    const variants = new Proxy([], { ownKeys() { throw new Error("hostile proxy"); } });
    assert.doesNotThrow(() => composition.validateCompositionVariantRegistry(makeRegistry(variants)));
    const result = composition.validateCompositionVariantRegistry(makeRegistry(variants));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((issue) => issue.code === "unsafe_object"));
  });

  await t.test("sparse array", () => {
    const result = composition.validateCompositionVariantRegistry(makeRegistry(new Array(1)));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((issue) => issue.code === "sparse_array"));
  });

  await t.test("extra array property", () => {
    const variants = [makeVariant("classic", ["3:2"])];
    Object.defineProperty(variants, "polluted", { value: true, enumerable: true });
    const result = composition.validateCompositionVariantRegistry(makeRegistry(variants));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((issue) => issue.code === "unknown_field"));
  });

  await t.test("array symbol", () => {
    const variants = [makeVariant("classic", ["3:2"])];
    variants[Symbol("polluted")] = true;
    const result = composition.validateCompositionVariantRegistry(makeRegistry(variants));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((issue) => issue.code === "symbol_property"));
  });

  await t.test("record getter", () => {
    let getterCalls = 0;
    const variant = makeVariant("classic", ["3:2"]);
    Object.defineProperty(variant, "label", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      },
    });
    const result = composition.validateCompositionVariantRegistry(makeRegistry([variant]));
    assert.equal(result.ok, false);
    assert.equal(getterCalls, 0);
    assert.ok(result.errors.some((issue) => issue.code === "accessor_property"));
  });

  await t.test("inherited prototype", () => {
    const hostile = Object.assign(Object.create({ polluted: true }), makeRegistry([
      makeVariant("classic", ["3:2"]),
    ]));
    const result = composition.validateCompositionVariantRegistry(hostile);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((issue) => issue.code === "invalid_record"));
  });
});

test("malicious planner asset arrays and inconsistent candidates fail closed without executing accessors", async (t) => {
  const registry = makeRegistry([makeVariant("classic", ["3:2"])]);

  await t.test("asset index getter", () => {
    let getterCalls = 0;
    const assets = [];
    Object.defineProperty(assets, "0", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      },
    });
    assets.length = 1;
    const result = assertInvalid(composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" }));
    assert.equal(getterCalls, 0);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_assets"));
  });

  await t.test("throwing asset proxy", () => {
    const assets = new Proxy([], { ownKeys() { throw new Error("hostile proxy"); } });
    assert.doesNotThrow(() => composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" }));
    const result = assertInvalid(composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" }));
    assert.ok(result.issues.some((issue) => issue.code === "invalid_assets"));
  });

  await t.test("duplicate and orientation-spoofed assets", () => {
    const duplicate = assertInvalid(composition.planComposition({
      registry,
      assets: [asset("duplicate", 1.5), asset("duplicate", 1.6)],
      mode: "RECOMMEND_VARIANT",
    }));
    assert.ok(duplicate.issues.some((issue) => issue.code === "duplicate_asset_id"));

    const spoofed = assertInvalid(composition.planComposition({
      registry,
      assets: [asset("spoofed", 1, "landscape")],
      mode: "RECOMMEND_VARIANT",
    }));
    assert.ok(spoofed.issues.some((issue) => issue.code === "invalid_asset"));
  });
});

test("ratio costs, hard orientation, and global assignment retain the intended mathematical semantics", () => {
  assert.equal(composition.ratioCostUnits(1.5, "3:2"), 0);
  assert.equal(
    composition.ratioCostUnits(1.2, "3:2"),
    Math.round(Math.abs(Math.log(1.2 / 1.5)) * composition.COMPOSITION_COST_SCALE),
  );

  const variant = makeVariant("classic", ["3:2", "16:9"]);
  const result = assertAssigned(composition.assignComposition({
    variant,
    assets: [asset("asset-a", 1.57), asset("asset-b", 1.2), asset("portrait", 2 / 3)],
  }));
  assert.deepEqual(ids(result), ["asset-b", "asset-a"]);
  assert.equal(new Set(ids(result)).size, 2);
  assert.equal(result.metrics.placeholderCount, 0);
});

test("square policy is explicit while near-square assets retain exact manifest orientation", () => {
  const landscapeSlot = makeVariant("classic", ["3:2"]);
  const squareOnly = assertAssigned(composition.assignComposition({
    variant: landscapeSlot,
    assets: [asset("square", 1)],
  }));
  assert.equal(squareOnly.assignments[0].assetId, "square");
  assert.equal(squareOnly.assignments[0].squarePenaltyUnits, composition.DEFAULT_SQUARE_PENALTY_UNITS);
  assert.equal(squareOnly.metrics.squareUseCount, 1);
  assert.equal(squareOnly.warnings[0].code, "square-fallback-used");

  const withPerfectLandscape = assertAssigned(composition.assignComposition({
    variant: landscapeSlot,
    assets: [asset("square", 1), asset("landscape", 1.5)],
  }));
  assert.equal(withPerfectLandscape.assignments[0].assetId, "landscape");
  assert.equal(withPerfectLandscape.metrics.squareUseCount, 0);

  const twoDirections = makeVariant("classic", ["3:2", "2:3"]);
  const nearSquares = assertAssigned(composition.assignComposition({
    variant: twoDirections,
    assets: [asset("near-landscape", 1.0001), asset("near-portrait", 0.9999)],
  }));
  assert.deepEqual(ids(nearSquares), ["near-landscape", "near-portrait"]);
  assert.equal(nearSquares.metrics.squareUseCount, 0);

  const invalidPenalty = assertInvalid(composition.assignComposition({
    variant: landscapeSlot,
    assets: [asset("square", 1)],
    squarePenaltyUnits: 0,
  }));
  assert.ok(invalidPenalty.issues.some((issue) => issue.code === "invalid_square_penalty"));
});

test("every approved locked conflict is explicit and never silently unlocks", async (t) => {
  const variant = makeVariant("classic", ["3:2", "3:2"]);
  const assets = [asset("land-a", 1.5), asset("land-b", 1.6), asset("portrait", 2 / 3)];
  const cases = [
    ["missing asset", [{ assetId: "missing", slotIndex: 0 }], "locked_asset_missing"],
    ["duplicate asset", [{ assetId: "land-a", slotIndex: 0 }, { assetId: "land-a", slotIndex: 1 }], "duplicate_locked_asset"],
    ["out-of-range slot", [{ assetId: "land-a", slotIndex: 2 }], "locked_slot_out_of_range"],
    ["orientation mismatch", [{ assetId: "portrait", slotIndex: 0 }], "locked_orientation_incompatible"],
    ["duplicate logical slot", [{ assetId: "land-a", slotIndex: 0 }, { assetId: "land-b", slotIndex: 0 }], "duplicate_locked_slot"],
    ["malformed lock", [{ assetId: "land-a", slotIndex: "0" }], "invalid_locked_intent"],
  ];

  for (const [name, locks, expectedCode] of cases) {
    await t.test(name, () => {
      const result = assertBlocked(composition.assignComposition({ variant, assets, locks }));
      assert.ok(result.lockedConflicts.some((conflict) => conflict.code === expectedCode), JSON.stringify(result));
      assert.equal(JSON.stringify(result).includes('"locked":false'), false);
    });
  }

  const valid = assertAssigned(composition.assignComposition({
    variant,
    assets,
    locks: [{ assetId: "land-a", slotIndex: 0 }],
  }));
  assert.deepEqual(valid.assignments.map(({ assetId, locked }) => ({ assetId, locked })), [
    { assetId: "land-a", locked: true },
    { assetId: "land-b", locked: false },
  ]);
});

test("critical secondary presentation outranks ordinary assignment crop", () => {
  const variant = makeVariant("classic", ["2:3"], {
    criticalIndexes: [0],
    secondaryBySlot: {
      0: [{ presentationKey: "wide-stage", ratio: "3:2", critical: true }],
    },
  });
  const result = assertAssigned(composition.assignComposition({
    variant,
    assets: [asset("portrait-primary", 2 / 3), asset("portrait-stage", 0.9)],
  }));
  assert.equal(result.assignments[0].assetId, "portrait-stage");
  assert.ok(result.assignments[0].assignmentCostUnits > 0);
  assert.ok(result.assignments[0].criticalSecondaryProjectionCostUnits > 0);
});

test("the lexicographic score comparator honors every documented component in order", () => {
  const numericKeys = [
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
  ];
  const base = Object.fromEntries(numericKeys.map((key) => [key, 0]));
  base.variantId = "alpha";
  for (const key of numericKeys) {
    const worse = { ...base, [key]: 1 };
    assert.equal(composition.compareCompositionPlanScores(base, worse), -1, key);
    assert.equal(composition.compareCompositionPlanScores(worse, base), 1, key);
  }
  assert.equal(composition.compareCompositionPlanScores(base, { ...base, variantId: "beta" }), -1);
});

test("KEEP_CURRENT_VARIANT and RECOMMEND_VARIANT have distinct explicit behavior", () => {
  const registry = makeRegistry([
    makeVariant("classic", ["3:2"], { fallbackPriority: 1 }),
    makeVariant("wide", ["16:9"], { fallbackPriority: 0 }),
  ]);
  const assets = [asset("wide-asset", 16 / 9)];
  const kept = assertPlanned(composition.planComposition({
    registry,
    assets,
    mode: "KEEP_CURRENT_VARIANT",
    currentVariantId: "classic",
  }));
  assert.equal(kept.chosenVariantId, "classic");
  assert.equal(kept.recommendationReason, "kept-current-variant");
  assert.equal(kept.evaluations.length, 1);

  const recommended = assertPlanned(composition.planComposition({
    registry,
    assets,
    mode: "RECOMMEND_VARIANT",
  }));
  assert.equal(recommended.chosenVariantId, "wide");
  assert.equal(recommended.recommendationReason, "best-score");

  const unavailable = assertBlocked(composition.planComposition({
    registry,
    assets,
    mode: "KEEP_CURRENT_VARIANT",
  }));
  assert.equal(unavailable.reason, "current-variant-unavailable");

  const unknown = assertInvalid(composition.planComposition({
    registry,
    assets,
    mode: "KEEP_CURRENT_VARIANT",
    currentVariantId: "missing",
  }));
  assert.ok(unknown.issues.some((issue) => issue.code === "invalid_current_variant_id"));
});

test("RECOMMEND evaluates alternative variants after a lock blocks one, and blocks if none work", () => {
  const registry = makeRegistry([
    makeVariant("landscape", ["3:2"], { fallbackPriority: 0 }),
    makeVariant("portrait", ["2:3"], { fallbackPriority: 1 }),
  ]);
  const assets = [asset("portrait-asset", 2 / 3)];
  const recovered = assertPlanned(composition.planComposition({
    registry,
    assets,
    locks: [{ assetId: "portrait-asset", slotIndex: 0 }],
    mode: "RECOMMEND_VARIANT",
  }));
  assert.equal(recovered.chosenVariantId, "portrait");
  assert.deepEqual(recovered.evaluations.map(({ status, variantId }) => ({ status, variantId })), [
    { status: "blocked", variantId: "landscape" },
    { status: "assigned", variantId: "portrait" },
  ]);

  const allBlocked = assertBlocked(composition.planComposition({
    registry: makeRegistry([
      makeVariant("landscape-a", ["3:2"], { fallbackPriority: 0 }),
      makeVariant("landscape-b", ["16:9"], { fallbackPriority: 1 }),
    ]),
    assets,
    locks: [{ assetId: "portrait-asset", slotIndex: 0 }],
    mode: "RECOMMEND_VARIANT",
  }));
  assert.equal(allBlocked.reason, "all-variants-blocked");
});

test("hysteresis keeps a current design for tiny crop gains but permits material improvement", () => {
  const registry = makeRegistry([
    makeVariant("classic", ["3:2"], { fallbackPriority: 1 }),
    makeVariant("wide", ["16:9"], { fallbackPriority: 0 }),
  ]);
  const tiny = assertPlanned(composition.planComposition({
    registry,
    assets: [asset("asset-tiny", 1.64)],
    currentVariantId: "classic",
    mode: "RECOMMEND_VARIANT",
  }));
  assert.equal(tiny.chosenVariantId, "classic");
  assert.equal(tiny.recommendationReason, "hysteresis-kept-current");

  const material = assertPlanned(composition.planComposition({
    registry,
    assets: [asset("asset-material", 1.68)],
    currentVariantId: "classic",
    mode: "RECOMMEND_VARIANT",
  }));
  assert.equal(material.chosenVariantId, "wide");
  assert.equal(material.recommendationReason, "best-score");
});

test("classic-reference hysteresis has an exact documented threshold without a current variant", () => {
  const registry = makeRegistry([
    makeVariant("classic", ["3:2"], { fallbackPriority: 0 }),
    makeVariant("wide", ["16:9"], { fallbackPriority: 1 }),
  ]);
  const ratioAtImprovement = (improvementUnits) => (
    Math.sqrt((3 / 2) * (16 / 9))
    * Math.exp(improvementUnits / (2 * composition.COMPOSITION_COST_SCALE))
  );
  const threshold = composition.MINIMUM_MEAN_CROP_IMPROVEMENT_TO_SWITCH_UNITS;

  const justBelow = assertPlanned(composition.planComposition({
    registry,
    assets: [asset("asset-below", ratioAtImprovement(threshold - 1))],
    mode: "RECOMMEND_VARIANT",
  }));
  assert.equal(justBelow.chosenVariantId, "classic");
  assert.equal(justBelow.recommendationReason, "hysteresis-kept-classic");

  for (const improvement of [threshold, threshold + 1]) {
    const switched = assertPlanned(composition.planComposition({
      registry,
      assets: [asset(`asset-${improvement}`, ratioAtImprovement(improvement))],
      mode: "RECOMMEND_VARIANT",
    }));
    assert.equal(switched.chosenVariantId, "wide", `improvement ${improvement}`);
    assert.equal(switched.recommendationReason, "best-score", `improvement ${improvement}`);
  }
});

test("planning workload charges KEEP for one variant but rejects an over-budget RECOMMEND", () => {
  const variants = Array.from({ length: 6 }, (_, index) => makeVariant(
    `variant-${index}`,
    Array(12).fill(index % 2 === 0 ? "3:2" : "16:9"),
    { fallbackPriority: index },
  ));
  const registry = makeRegistry(variants, { templateId: "workload-template" });
  const assets = Array.from({ length: 10_000 }, (_, index) => asset(
    `workload-${String(index).padStart(5, "0")}`,
    1.5 + (index % 101) / 10_000,
  ));

  const kept = assertPlanned(composition.planComposition({
    registry,
    assets,
    currentVariantId: "variant-0",
    mode: "KEEP_CURRENT_VARIANT",
  }));
  assert.equal(kept.chosenVariantId, "variant-0");
  assert.equal(kept.evaluations.length, 1);

  const rejected = assertInvalid(composition.planComposition({
    registry,
    assets,
    mode: "RECOMMEND_VARIANT",
  }));
  assert.ok(rejected.issues.some((issue) => issue.code === "planning_workload_exceeded"));
});

test("synthetic 01: 90 percent portrait selects the matching fixed-count composition", () => {
  const registry = makeRegistry([
    makeVariant("balanced", [...Array(5).fill("2:3"), ...Array(5).fill("3:2")], { fallbackPriority: 0 }),
    makeVariant("portrait-heavy", [...Array(9).fill("2:3"), "3:2"], { fallbackPriority: 1 }),
  ]);
  const assets = [
    ...Array.from({ length: 9 }, (_, index) => asset(`portrait-${index}`, 2 / 3)),
    asset("landscape-0", 1.5),
  ];
  const result = assertPlanned(composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" }));
  assert.equal(result.chosenVariantId, "portrait-heavy");
  assert.equal(result.score.placeholderCount, 0);
});

test("synthetic 02: 90 percent landscape selects the matching fixed-count composition", () => {
  const registry = makeRegistry([
    makeVariant("balanced", [...Array(5).fill("2:3"), ...Array(5).fill("3:2")], { fallbackPriority: 0 }),
    makeVariant("landscape-heavy", ["2:3", ...Array(9).fill("3:2")], { fallbackPriority: 1 }),
  ]);
  const assets = [
    asset("portrait-0", 2 / 3),
    ...Array.from({ length: 9 }, (_, index) => asset(`landscape-${index}`, 1.5)),
  ];
  const result = assertPlanned(composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" }));
  assert.equal(result.chosenVariantId, "landscape-heavy");
  assert.equal(result.score.placeholderCount, 0);
});

test("synthetic 03: a 50/50 library selects a balanced composition", () => {
  const registry = makeRegistry([
    makeVariant("balanced", [...Array(5).fill("2:3"), ...Array(5).fill("3:2")], { fallbackPriority: 1 }),
    makeVariant("portrait-heavy", [...Array(9).fill("2:3"), "3:2"], { fallbackPriority: 0 }),
  ]);
  const assets = [
    ...Array.from({ length: 5 }, (_, index) => asset(`portrait-${index}`, 2 / 3)),
    ...Array.from({ length: 5 }, (_, index) => asset(`landscape-${index}`, 1.5)),
  ];
  const result = assertPlanned(composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" }));
  assert.equal(result.chosenVariantId, "balanced");
  assert.equal(result.score.placeholderCount, 0);
});

test("synthetic 04: landscape material near 3:2 chooses lower crop pressure", () => {
  const registry = makeRegistry([
    makeVariant("wide", Array(6).fill("16:9"), { fallbackPriority: 0 }),
    makeVariant("classic", Array(6).fill("3:2"), { fallbackPriority: 1 }),
  ]);
  const assets = Array.from({ length: 6 }, (_, index) => asset(`landscape-${index}`, 1.49));
  const result = assertPlanned(composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" }));
  assert.equal(result.chosenVariantId, "classic");
  assert.equal(result.score.placeholderCount, 0);
});

test("synthetic 05: portrait-heavy critical slots win when fill is equal", () => {
  const registry = makeRegistry([
    makeVariant("critical-portrait", ["2:3", "2:3", "3:2", "3:2"], { fallbackPriority: 1, criticalIndexes: [0, 1] }),
    makeVariant("critical-landscape", ["3:2", "3:2", "2:3", "2:3"], { fallbackPriority: 0, criticalIndexes: [0, 1] }),
  ]);
  const assets = [
    asset("portrait-a", 2 / 3),
    asset("portrait-b", 0.7),
    asset("portrait-c", 0.72),
    asset("landscape-a", 1.5),
  ];
  const result = assertPlanned(composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" }));
  assert.equal(result.chosenVariantId, "critical-portrait");
  assert.equal(result.score.criticalSlotMissing, 0);
  const evaluations = new Map(result.evaluations.map((evaluation) => [evaluation.variantId, evaluation]));
  assert.equal(evaluations.get("critical-portrait").score.placeholderCount, 1);
  assert.equal(evaluations.get("critical-landscape").score.placeholderCount, 1);
  assert.equal(evaluations.get("critical-landscape").score.criticalSlotMissing, 1);
});

test("synthetic 06: square-heavy and near-square inputs preserve explicit penalties and orientations", () => {
  const variant = makeVariant("classic", [...Array(5).fill("3:2"), ...Array(5).fill("2:3")]);
  const assets = [
    ...Array.from({ length: 8 }, (_, index) => asset(`square-${index}`, 1)),
    asset("near-landscape", 1.0001),
    asset("near-portrait", 0.9999),
  ];
  const result = assertAssigned(composition.assignComposition({ variant, assets }));
  assert.equal(result.metrics.placeholderCount, 0);
  assert.equal(result.metrics.squareUseCount, 8);
  const nearLandscape = result.assignments.find((assignment) => assignment.assetId === "near-landscape");
  const nearPortrait = result.assignments.find((assignment) => assignment.assetId === "near-portrait");
  assert.ok(nearLandscape);
  assert.ok(nearPortrait);
  assert.equal(variant.slots[nearLandscape.slotIndex].assignmentRatio, "3:2");
  assert.equal(variant.slots[nearPortrait.slotIndex].assignmentRatio, "2:3");
});

test("synthetic 07: fewer assets than slots produces intentional deterministic placeholders", () => {
  const variant = makeVariant("classic", ["3:2", "3:2", "2:3", "2:3"]);
  const result = assertAssigned(composition.assignComposition({
    variant,
    assets: [asset("landscape", 1.5), asset("portrait", 2 / 3)],
  }));
  assert.equal(result.metrics.placeholderCount, 2);
  assert.equal(result.metrics.orientationShortage, 0);
  assert.deepEqual(result.warnings[0].slotIndexes, [1, 3]);
});

test("orientation shortage separates compatibility loss from unavoidable library-count gaps", () => {
  const variant = makeVariant("classic", ["3:2", "3:2", "2:3", "2:3"]);
  const result = assertAssigned(composition.assignComposition({
    variant,
    assets: Array.from({ length: 4 }, (_, index) => asset(`landscape-${index}`, 1.5)),
  }));
  assert.equal(result.metrics.placeholderCount, 2);
  assert.equal(result.metrics.landscapeShortage, 0);
  assert.equal(result.metrics.portraitShortage, 2);
  assert.equal(result.metrics.orientationShortage, 2);
});

test("synthetic 08: far more assets than slots still finds unique global optima", () => {
  const variant = makeVariant("classic", ["3:2", "16:9", "2:3"]);
  const assets = [
    ...Array.from({ length: 100 }, (_, index) => asset(`noise-${String(index).padStart(3, "0")}`, index % 2 ? 1.2 : 0.8)),
    asset("perfect-landscape", 1.5),
    asset("perfect-wide", 16 / 9),
    asset("perfect-portrait", 2 / 3),
  ];
  const result = assertAssigned(composition.assignComposition({ variant, assets }));
  assert.deepEqual(new Set(ids(result)), new Set(["perfect-landscape", "perfect-wide", "perfect-portrait"]));
});

test("synthetic 09: locked conflict result is blocked and serializable", () => {
  const result = assertBlocked(composition.planComposition({
    registry: makeRegistry([makeVariant("classic", ["3:2"])]),
    assets: [asset("portrait", 2 / 3)],
    locks: [{ assetId: "portrait", slotIndex: 0 }],
    mode: "RECOMMEND_VARIANT",
  }));
  assert.equal(result.reason, "all-variants-blocked");
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("synthetic 10: current variant and re-recommend modes remain observably distinct", () => {
  const registry = makeRegistry([
    makeVariant("classic", ["3:2"], { fallbackPriority: 1 }),
    makeVariant("wide", ["16:9"], { fallbackPriority: 0 }),
  ]);
  const assets = [asset("wide", 16 / 9)];
  assert.equal(assertPlanned(composition.planComposition({ registry, assets, currentVariantId: "classic", mode: "KEEP_CURRENT_VARIANT" })).chosenVariantId, "classic");
  assert.equal(assertPlanned(composition.planComposition({ registry, assets, currentVariantId: "classic", mode: "RECOMMEND_VARIANT" })).chosenVariantId, "wide");
});

test("synthetic 11: critical secondary projection changes an otherwise primary-only choice", () => {
  const variant = makeVariant("classic", ["2:3"], {
    secondaryBySlot: { 0: [{ presentationKey: "portal", ratio: "3:2", critical: true }] },
  });
  const result = assertAssigned(composition.assignComposition({
    variant,
    assets: [asset("primary", 2 / 3), asset("projectable", 0.9)],
  }));
  assert.equal(result.assignments[0].assetId, "projectable");
});

test("synthetic 12: deterministic ties use stable fallback and asset identities", () => {
  const registry = makeRegistry([
    makeVariant("zeta", ["3:2"], { fallbackPriority: 1 }),
    makeVariant("alpha", ["3:2"], { fallbackPriority: 0 }),
  ]);
  const result = assertPlanned(composition.planComposition({
    registry,
    assets: [asset("asset-z", 1.5), asset("asset-a", 1.5)],
    mode: "RECOMMEND_VARIANT",
  }));
  assert.equal(result.chosenVariantId, "alpha");
  assert.equal(result.assignments[0].assetId, "asset-a");
});

test("planner output is repeatable across 100 runs, input reversal, and frozen inputs", () => {
  const input = deepFreeze({
    registry: makeRegistry([
      makeVariant("wide", ["16:9", "2:3", "3:2"], { fallbackPriority: 1 }),
      makeVariant("classic", ["3:2", "2:3", "16:9"], { fallbackPriority: 0 }),
    ]),
    assets: [asset("asset-z", 1.7), asset("asset-a", 1.5), asset("asset-p", 2 / 3)],
    existingIntent: [{ assetId: "asset-a", slotIndex: 0 }],
    mode: "RECOMMEND_VARIANT",
  });
  const before = JSON.stringify(input);
  const first = composition.planComposition(input);
  for (let run = 0; run < 100; run += 1) assert.deepEqual(composition.planComposition(input), first);

  const reversed = {
    ...clone(input),
    registry: { ...clone(input.registry), variants: [...clone(input.registry.variants)].reverse() },
    assets: [...clone(input.assets)].reverse(),
  };
  assert.deepEqual(composition.planComposition(reversed), first);
  assert.equal(JSON.stringify(input), before);
  assert.ok(Object.isFrozen(first));
  if (first.status === "planned") {
    assert.ok(Object.isFrozen(first.assignments));
    assert.ok(Object.isFrozen(first.evaluations));
  }
});

test("classic test adapter preserves all 11 fixed catalog identities and orientation semantics", () => {
  assert.equal(templateCatalog.length, 11);
  for (const template of templateCatalog) {
    assert.equal("variantId" in template, false, `${template.id} must remain a production fixed-layout catalog`);
    const variant = makeVariant("classic", [...template.slotRatios]);
    const validation = composition.validateCompositionVariantRegistry(makeRegistry([variant], {
      templateId: template.id,
      templateVersion: 1,
    }));
    assert.equal(validation.ok, true, `${template.id}: ${JSON.stringify(validation)}`);
    assert.equal(variant.slots.length, template.photoSlots, template.id);
    assert.deepEqual(variant.slots.map((slot) => slot.assignmentRatio), [...template.slotRatios], template.id);

    const sparseAssets = [
      legacyAsset(`${template.id}-land-a`, 1.51),
      legacyAsset(`${template.id}-land-b`, 1.69),
      legacyAsset(`${template.id}-portrait`, 0.68),
    ];
    const legacyWorks = legacyLibrary.autoComposeTemplateWorks(sparseAssets, template.slotRatios);
    const planned = assertAssigned(composition.assignComposition({
      variant,
      assets: sparseAssets.map(({ id, aspectRatio, orientation }) => asset(id, aspectRatio, orientation)),
    }));
    const plannedFilled = planned.assignments.filter((assignment) => assignment.assetId !== null);
    assert.equal(plannedFilled.length, legacyWorks.length, `${template.id}: fill parity`);
    assert.equal(planned.metrics.placeholderCount, template.photoSlots - legacyWorks.length, `${template.id}: placeholder parity`);

    for (const assignment of plannedFilled) {
      const selected = sparseAssets.find((entry) => entry.id === assignment.assetId);
      const slotOrientation = ratioValue(template.slotRatios[assignment.slotIndex]) < 1 ? "portrait" : "landscape";
      assert.ok(selected.orientation === "square" || selected.orientation === slotOrientation, `${template.id}: orientation parity`);
    }

    const lockSlot = 0;
    const lockedAsset = template.slotRatios[lockSlot] === "2:3" ? sparseAssets[2] : sparseAssets[0];
    const lockedWork = { ...legacyLibrary.assetToWork(lockedAsset, lockSlot), locked: true };
    const legacyLocked = legacyLibrary.autoComposeTemplateWorks(sparseAssets, template.slotRatios, [lockedWork]);
    const newLocked = assertAssigned(composition.assignComposition({
      variant,
      assets: sparseAssets.map(({ id, aspectRatio, orientation }) => asset(id, aspectRatio, orientation)),
      locks: [{ assetId: lockedAsset.id, slotIndex: lockSlot }],
    }));
    assert.equal(legacyLocked.find((work) => work.slotIndex === lockSlot)?.assetId, lockedAsset.id, `${template.id}: legacy valid lock`);
    assert.equal(newLocked.assignments[lockSlot].assetId, lockedAsset.id, `${template.id}: new valid lock`);
    assert.equal(newLocked.assignments[lockSlot].locked, true, `${template.id}: new lock flag`);
  }
});

test("12 slots x 10,000 assets x 5 variants completes deterministically within two seconds", { timeout: 20_000 }, (t) => {
  const ratios = Array(12).fill("3:2");
  const variants = [
    makeVariant("wide-a", Array(12).fill("16:9"), { fallbackPriority: 0 }),
    makeVariant("wide-b", Array(12).fill("16:9"), { fallbackPriority: 1 }),
    makeVariant("wide-c", Array(12).fill("16:9"), { fallbackPriority: 2 }),
    makeVariant("wide-d", Array(12).fill("16:9"), { fallbackPriority: 3 }),
    makeVariant("tail-winner", ratios, { fallbackPriority: 4 }),
  ];
  const registry = makeRegistry(variants, { templateId: "performance-template" });
  const assets = Array.from({ length: 10_000 }, (_, index) => asset(
    `asset-${String(index).padStart(5, "0")}`,
    index >= 9_988 ? 1.5 : 1.2 + (index % 17) / 10_000,
  ));

  const started = performance.now();
  const first = composition.planComposition({ registry, assets, mode: "RECOMMEND_VARIANT" });
  const elapsed = performance.now() - started;
  const planned = assertPlanned(first);
  assert.equal(planned.chosenVariantId, "tail-winner");
  assert.equal(planned.assignments.length, 12);
  assert.equal(new Set(planned.assignments.map((assignment) => assignment.assetId)).size, 12);
  assert.ok(planned.assignments.every((assignment) => Number(assignment.assetId.slice(-5)) >= 9_988));
  assert.ok(Object.values(planned.score).every((value) => typeof value === "string" || Number.isFinite(value)));
  assert.ok(elapsed <= 2_000, `public planner took ${elapsed.toFixed(1)}ms`);

  const reversed = composition.planComposition({
    registry: { ...registry, variants: [...variants].reverse() },
    assets: [...assets].reverse(),
    mode: "RECOMMEND_VARIANT",
  });
  assert.deepEqual(reversed, first);
  t.diagnostic(`10k public planner: ${elapsed.toFixed(1)}ms (ceiling: 2000ms)`);
});

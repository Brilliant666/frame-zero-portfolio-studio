import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function source(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

async function importMaterialProfiles(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-template-materials-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  for (const [relativePath, outputName] of [
    ["app/templates/catalog.ts", "catalog.mjs"],
    ["app/photo-ratio-policy.ts", "photo-ratio-policy.mjs"],
    ["app/templates/material-profiles.ts", "material-profiles.mjs"],
  ]) {
    const input = await source(relativePath);
    let output = ts.transpileModule(input, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: relativePath,
    }).outputText;
    output = output.replaceAll('from "./catalog"', 'from "./catalog.mjs"');
    output = output.replaceAll('from "../photo-ratio-policy"', 'from "./photo-ratio-policy.mjs"');
    await fs.writeFile(path.join(directory, outputName), output, "utf8");
  }

  const catalog = await import(`${pathToFileURL(path.join(directory, "catalog.mjs")).href}?test=${Date.now()}`);
  const profiles = await import(`${pathToFileURL(path.join(directory, "material-profiles.mjs")).href}?test=${Date.now()}`);
  return { ...catalog, ...profiles };
}

test("all eleven templates expose bounded, immutable material profiles", async (t) => {
  const {
    getTemplateMaterialProfile,
    templateCatalog,
    templateMaterialProfiles,
  } = await importMaterialProfiles(t);

  assert.equal(templateMaterialProfiles.length, 11);
  assert.deepEqual(
    templateMaterialProfiles.map(({ templateId }) => templateId),
    templateCatalog.map(({ id }) => id),
  );
  assert.ok(Object.isFrozen(templateMaterialProfiles));

  for (const catalog of templateCatalog) {
    const profile = getTemplateMaterialProfile(catalog.id);
    assert.equal(profile.templateId, catalog.id);
    assert.equal(profile.maximumUsefulPhotoCount, catalog.photoSlots);
    assert.deepEqual(profile.slotAspectTargets, catalog.slotRatios);
    assert.ok(profile.minimumUsefulPhotoCount > 0);
    assert.ok(profile.minimumUsefulPhotoCount <= profile.recommendedPhotoCount);
    assert.ok(profile.recommendedPhotoCount <= profile.maximumUsefulPhotoCount);
    assert.ok(profile.heroSlotCount >= 0 && profile.heroSlotCount <= profile.maximumUsefulPhotoCount);

    const demands = [
      profile.landscapeDemand,
      profile.portraitDemand,
      profile.squareDemand,
      profile.sourceAdaptiveDemand,
    ];
    for (const demand of demands) {
      assert.ok(Number.isSafeInteger(demand.minimum) && demand.minimum >= 0);
      assert.ok(Number.isSafeInteger(demand.recommended) && demand.recommended >= demand.minimum);
      assert.ok(demand.note.length > 0);
      assert.ok(Object.isFrozen(demand));
    }
    assert.equal(
      demands.reduce((total, demand) => total + demand.minimum, 0),
      profile.minimumUsefulPhotoCount,
    );
    assert.equal(
      demands.reduce((total, demand) => total + demand.recommended, 0),
      profile.recommendedPhotoCount,
    );

    const prioritySlots = profile.visualPriority.map(({ slotIndex }) => slotIndex);
    assert.equal(new Set(prioritySlots).size, prioritySlots.length);
    assert.ok(prioritySlots.every((slotIndex) => slotIndex >= 0 && slotIndex < catalog.photoSlots));
    assert.equal(
      profile.visualPriority.filter(({ role }) => role === "hero" || role === "cover").length,
      profile.heroSlotCount,
    );

    for (const presentation of profile.secondaryPresentations) {
      assert.ok(presentation.slotIndexes.length > 0);
      assert.equal(new Set(presentation.slotIndexes).size, presentation.slotIndexes.length);
      assert.ok(presentation.slotIndexes.every((slotIndex) => slotIndex >= 0 && slotIndex < catalog.photoSlots));
      assert.ok(Object.isFrozen(presentation));
      assert.ok(Object.isFrozen(presentation.slotIndexes));
    }

    assert.ok(Object.isFrozen(profile));
    assert.ok(Object.isFrozen(profile.slotAspectTargets));
    assert.ok(Object.isFrozen(profile.visualPriority));
    assert.ok(Object.isFrozen(profile.cropPressure));
    assert.ok(Object.isFrozen(profile.mobileBehavior));
    assert.ok(Object.isFrozen(profile.sourceAdaptiveDemand));
    assert.ok(Object.isFrozen(profile.secondaryPresentations));
    assert.ok(Object.isFrozen(profile.optionalNotes));
  }
});

test("material profiles preserve differentiated implementation-driven demands", async (t) => {
  const {
    formatTemplateMaterialDirectionSummary,
    getTemplateMaterialPlanSummary,
    getTemplateMaterialProfile,
  } = await importMaterialProfiles(t);

  const film = getTemplateMaterialProfile("film-rail");
  assert.deepEqual(
    [film.landscapeDemand.recommended, film.portraitDemand.recommended, film.squareDemand.recommended],
    [9, 0, 0],
  );
  assert.equal(film.recommendedPhotoCount, 9);
  assert.equal(film.mobileBehavior.mode, "horizontal-rail");

  const orbital = getTemplateMaterialProfile("orbital-portal");
  assert.deepEqual(
    [orbital.landscapeDemand.recommended, orbital.portraitDemand.recommended, orbital.squareDemand.recommended],
    [0, 8, 0],
  );
  assert.equal(orbital.secondaryPresentations[0].target, "3:2");
  assert.equal(orbital.secondaryPresentations[0].slotIndexes.length, 8);

  const character = getTemplateMaterialProfile("character-select");
  assert.deepEqual(
    [character.landscapeDemand.recommended, character.portraitDemand.recommended, character.squareDemand.recommended],
    [0, 0, 0],
  );
  assert.ok(character.secondaryPresentations.some(({ target }) => target === "variable"));
  assert.ok(character.secondaryPresentations.every(({ target }) => target !== "1:1"));
  assert.deepEqual(
    [character.sourceAdaptiveDemand.minimum, character.sourceAdaptiveDemand.recommended],
    [5, 9],
  );

  const cinematic = getTemplateMaterialProfile("cinematic-light");
  assert.deepEqual(
    [cinematic.landscapeDemand.recommended, cinematic.portraitDemand.recommended, cinematic.sourceAdaptiveDemand.recommended],
    [2, 0, 7],
  );
  assert.equal(cinematic.recommendedPhotoCount, 9);
  assert.deepEqual(cinematic.visualPriority.map(({ slotIndex }) => slotIndex), [0, 8]);

  const neon = getTemplateMaterialProfile("neon-hud");
  assert.equal(neon.recommendedPhotoCount, 9);
  assert.deepEqual(
    neon.secondaryPresentations[0].slotIndexes,
    [0, 1, 2, 3, 4, 5, 6, 7],
  );

  const manga = getTemplateMaterialProfile("manga-panels");
  assert.deepEqual(
    [manga.landscapeDemand.recommended, manga.portraitDemand.recommended, manga.sourceAdaptiveDemand.recommended],
    [2, 1, 6],
  );
  assert.equal(manga.recommendedPhotoCount, 9);

  assert.equal(getTemplateMaterialProfile("archive-os").recommendedPhotoCount, 12);
  assert.equal(getTemplateMaterialProfile("museum-depth").recommendedPhotoCount, 7);
  assert.equal(getTemplateMaterialProfile("polaroid-field").visualPriority[0].slotIndex, 4);

  const expectedPlans = {
    "cinematic-light": [2, 0, 7, 2],
    "neon-hud": [2, 0, 7, 2],
    "film-rail": [9, 0, 0, 0],
    "manga-panels": [2, 1, 6, 2],
    "prism-liquid": [2, 1, 6, 1],
    "orbital-portal": [0, 8, 0, 0],
    "archive-os": [1, 0, 11, 0],
    "editorial-duet": [3, 1, 5, 3],
    "polaroid-field": [1, 1, 7, 0],
    "character-select": [0, 0, 9, 0],
    "museum-depth": [1, 1, 5, 0],
  };
  for (const [templateId, expected] of Object.entries(expectedPlans)) {
    const plan = getTemplateMaterialPlanSummary(templateId);
    const profile = getTemplateMaterialProfile(templateId);
    assert.deepEqual(
      [plan.fixedLandscapeCount, plan.fixedPortraitCount, plan.sourceAdaptiveCount, plan.fixedWideCropCount],
      expected,
      `${templateId} must expose the slot policy as one material plan`,
    );
    assert.equal(
      plan.fixedLandscapeCount + plan.fixedPortraitCount + plan.sourceAdaptiveCount,
      plan.totalSlots,
    );
    assert.deepEqual(
      [plan.fixedLandscapeCount, plan.fixedPortraitCount, plan.sourceAdaptiveCount],
      [
        profile.landscapeDemand.recommended,
        profile.portraitDemand.recommended,
        profile.sourceAdaptiveDemand.recommended,
      ],
    );
    assert.equal(profile.squareDemand.recommended, 0);
    assert.doesNotMatch(formatTemplateMaterialDirectionSummary(plan), /16:9/);
    assert.ok(Object.isFrozen(plan));
  }

  const prismPlan = getTemplateMaterialPlanSummary("prism-liquid");
  assert.equal(
    formatTemplateMaterialDirectionSummary(prismPlan),
    "固定横图 2 张 · 固定竖图 1 张 · 任意方向 6 张",
  );
  assert.deepEqual(
    getTemplateMaterialProfile("prism-liquid").secondaryPresentations[0],
    {
      slotIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      target: "3:2",
      critical: true,
      note: "九个可选槽位中的任意照片都可能进入固定 3:2 棱镜主视窗。",
    },
  );
});

test("material profiles stay presentation-only and out of persistence contracts", async () => {
  const [siteDocument, adapter, templateEditor] = await Promise.all([
    source("app/site-document.ts"),
    source("app/legacy-site-content-adapter.ts"),
    source("app/admin/template/template-editor.tsx"),
  ]);

  assert.doesNotMatch(siteDocument, /TemplateMaterialProfile|material-profiles/);
  assert.doesNotMatch(adapter, /TemplateMaterialProfile|material-profiles/);
  assert.match(templateEditor, /getTemplateMaterialProfile/);
  assert.match(templateEditor, /getTemplateMaterialPlanSummary/);
  assert.match(templateEditor, /formatTemplateMaterialDirectionSummary/);
  assert.match(templateEditor, /data-template-material-profile/);
  assert.doesNotMatch(templateEditor, /photoRatios|比例计划/);
  assert.doesNotMatch(templateEditor, /SiteDocumentV1|variantId|method:\s*"PUT"/);
});

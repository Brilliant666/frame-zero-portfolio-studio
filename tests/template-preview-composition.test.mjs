import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sources = [
  ["app/template-composition/contract.ts", "contract.mjs"],
  ["app/template-composition/assignment.ts", "assignment.mjs"],
  ["app/templates/catalog.ts", "catalog.mjs"],
  ["app/templates/material-profiles.ts", "material-profiles.mjs"],
  ["app/photo-library.ts", "photo-library.mjs"],
  ["app/templates/template-preview-composition.ts", "template-preview-composition.mjs"],
];

async function readSource(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function rewriteImports(output) {
  return output
    .replaceAll('from "./contract"', 'from "./contract.mjs"')
    .replaceAll('from "./assignment"', 'from "./assignment.mjs"')
    .replaceAll('from "./catalog"', 'from "./catalog.mjs"')
    .replaceAll('from "../template-composition/assignment"', 'from "./assignment.mjs"')
    .replaceAll('from "../template-composition/contract"', 'from "./contract.mjs"')
    .replaceAll('from "../photo-library"', 'from "./photo-library.mjs"')
    .replaceAll('from "./material-profiles"', 'from "./material-profiles.mjs"');
}

async function importPreviewModule(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-template-preview-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  for (const [relativePath, outputName] of sources) {
    const output = ts.transpileModule(await readSource(relativePath), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: relativePath,
    }).outputText;
    await fs.writeFile(path.join(directory, outputName), rewriteImports(output), "utf8");
  }

  const cacheKey = `${process.pid}-${Date.now()}-${Math.random()}`;
  const [catalog, profiles, preview] = await Promise.all([
    import(`${pathToFileURL(path.join(directory, "catalog.mjs")).href}?test=${cacheKey}`),
    import(`${pathToFileURL(path.join(directory, "material-profiles.mjs")).href}?test=${cacheKey}`),
    import(`${pathToFileURL(path.join(directory, "template-preview-composition.mjs")).href}?test=${cacheKey}`),
  ]);
  return { ...catalog, ...profiles, ...preview };
}

function photoAsset(id, aspectRatio) {
  const orientation = aspectRatio > 1 ? "landscape" : aspectRatio < 1 ? "portrait" : "square";
  const full = aspectRatio >= 1
    ? { width: Math.round(aspectRatio * 1_200), height: 1_200 }
    : { width: 1_200, height: Math.round(1_200 / aspectRatio) };
  const variant = (kind, scale) => ({
    src: `/photos/library/${id}-${kind}.webp`,
    width: Math.max(1, Math.round(full.width * scale)),
    height: Math.max(1, Math.round(full.height * scale)),
    bytes: 1_000,
  });
  return {
    id,
    aspectRatio,
    orientation,
    variants: {
      thumbnail: variant("thumbnail", .25),
      card: variant("card", .5),
      full: variant("full", 1),
    },
  };
}

function completeLibrary() {
  return [
    ...Array.from({ length: 12 }, (_, index) => photoAsset(`landscape-${String(index).padStart(2, "0")}`, index % 3 === 0 ? 16 / 9 : 3 / 2)),
    ...Array.from({ length: 8 }, (_, index) => photoAsset(`portrait-${String(index).padStart(2, "0")}`, 2 / 3)),
    photoAsset("square-00", 1),
    photoAsset("square-01", 1),
  ];
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ("value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

test("all eleven classic previews use the pure assignment engine deterministically", async (t) => {
  const {
    planTemplateCompositionPreview,
    templateCatalog,
  } = await importPreviewModule(t);
  const assets = deepFreeze(completeLibrary());

  for (const template of templateCatalog) {
    const forward = planTemplateCompositionPreview({ templateId: template.id, assets });
    const reverse = planTemplateCompositionPreview({ templateId: template.id, assets: [...assets].reverse() });
    assert.equal(forward.status, "planned", JSON.stringify(forward));
    assert.deepEqual(reverse, forward);
    assert.equal(forward.assignment.status, "assigned");
    assert.equal(forward.assignment.variantId, "classic-preview");
    assert.equal(forward.assignments.length, template.photoSlots);
    assert.equal(forward.works.length, template.photoSlots);
    assert.equal(forward.heroMissingCount, 0);
    assert.equal(new Set(forward.works.map(({ assetId }) => assetId)).size, template.photoSlots);
    assert.equal(forward.materialStatus, "material-ready");
    assert.ok(Object.isFrozen(forward));
    assert.ok(Object.isFrozen(forward.works));
  }
});

test("preview names a missing hero instead of hiding it behind a generic score", async (t) => {
  const { planTemplateCompositionPreview } = await importPreviewModule(t);
  const preview = planTemplateCompositionPreview({
    templateId: "film-rail",
    assets: [photoAsset("portrait-only", 2 / 3)],
  });

  assert.equal(preview.status, "planned");
  assert.equal(preview.heroMissingCount, 1);
  assert.equal(preview.filledPhotoCount, 0);
  assert.equal(preview.materialStatus, "material-short");
});

test("preview reports orientation shortage and keeps intentional placeholders", async (t) => {
  const { planTemplateCompositionPreview } = await importPreviewModule(t);
  const portraitPoorLibrary = [
    ...Array.from({ length: 10 }, (_, index) => photoAsset(`wide-${index}`, 3 / 2)),
    photoAsset("portrait-a", 2 / 3),
    photoAsset("portrait-b", 2 / 3),
  ];
  const preview = planTemplateCompositionPreview({
    templateId: "orbital-portal",
    assets: portraitPoorLibrary,
  });

  assert.equal(preview.status, "planned");
  assert.equal(preview.materialStatus, "material-short");
  assert.equal(preview.filledPhotoCount, 2);
  assert.equal(preview.placeholderCount, 6);
  assert.deepEqual(
    preview.shortages.find(({ orientation }) => orientation === "portrait"),
    { orientation: "portrait", minimumMissing: 2, recommendedMissing: 6 },
  );
});

test("valid locks survive preview while missing locked assets block explicitly", async (t) => {
  const { planTemplateCompositionPreview } = await importPreviewModule(t);
  const assets = completeLibrary();
  const lockedAsset = assets[0];
  const lockedWork = {
    assetId: lockedAsset.id,
    slotIndex: 0,
    locked: true,
    code: "LOCKED",
    title: "Locked synthetic work",
    subtitle: "Fixture only",
    image: lockedAsset.variants.full.src,
    preview: lockedAsset.variants.card.src,
    position: "42% 38%",
    previewWidth: lockedAsset.variants.card.width,
    previewHeight: lockedAsset.variants.card.height,
    fullWidth: lockedAsset.variants.full.width,
    enabled: true,
  };
  const planned = planTemplateCompositionPreview({
    templateId: "film-rail",
    assets,
    existingWorks: [lockedWork],
  });
  assert.equal(planned.status, "planned");
  assert.equal(planned.works[0].assetId, lockedAsset.id);
  assert.equal(planned.works[0].locked, true);
  assert.equal(planned.works[0].title, "Locked synthetic work");
  assert.equal(planned.works[0].position, "42% 38%");

  const blocked = planTemplateCompositionPreview({
    templateId: "film-rail",
    assets,
    existingWorks: [{ ...lockedWork, assetId: "missing-asset" }],
  });
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.reason, /锁定槽位/);
});

test("preview is read-only and explicit apply changes only one local draft layout", async (t) => {
  const {
    applyTemplateCompositionPreview,
    planTemplateCompositionPreview,
  } = await importPreviewModule(t);
  const assets = deepFreeze(completeLibrary());
  const original = deepFreeze({
    activeTemplate: "character-select",
    templateWorks: {
      "museum-depth": [{ assetId: "older", slotIndex: 0 }],
    },
    marker: "unchanged",
  });
  const before = structuredClone(original);

  const preview = planTemplateCompositionPreview({
    templateId: "film-rail",
    assets,
  });
  assert.equal(preview.status, "planned");
  assert.deepEqual(original, before, "planning must not mutate the draft");

  const applied = applyTemplateCompositionPreview(original, preview);
  assert.deepEqual(original, before, "apply must not mutate its input draft");
  assert.notEqual(applied, original);
  assert.equal(applied.activeTemplate, "character-select", "apply must not select the inspected template");
  assert.equal(applied.marker, "unchanged");
  assert.deepEqual(applied.templateWorks["museum-depth"], original.templateWorks["museum-depth"]);
  assert.equal(applied.templateWorks["film-rail"].length, 9);
  assert.notEqual(applied.templateWorks["film-rail"], preview.works, "the editable draft must not alias frozen preview works");
});

test("preview modules contain no persistence or network implementation", async () => {
  const [planner, previewComponent] = await Promise.all([
    readSource("app/templates/template-preview-composition.ts"),
    readSource("app/admin/template/template-composition-preview.tsx"),
  ]);
  assert.match(planner, /assignComposition\(/);
  assert.doesNotMatch(planner, /fetch\(|XMLHttpRequest|method:\s*"PUT"|\/api\/site-content/);
  assert.match(previewComponent, /data-preview-readonly="true"/);
  assert.match(previewComponent, /应用此排版到草稿/);
  assert.doesNotMatch(previewComponent, /method:\s*"PUT"|\/api\/site-content/);
});

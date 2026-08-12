import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importTypeScriptModule(t, sourceRelativePath) {
  const sourcePath = new URL(`../${sourceRelativePath}`, import.meta.url);
  const source = await fs.readFile(sourcePath, "utf8");
  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path.basename(sourceRelativePath),
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-layout-test-"));
  const modulePath = path.join(directory, `${path.basename(sourceRelativePath, path.extname(sourceRelativePath))}.mjs`);
  if (
    sourceRelativePath === "app/photo-library.ts"
    || sourceRelativePath === "app/templates/shared/source-orientation-layout.ts"
  ) {
    const policySource = await fs.readFile(new URL("../app/photo-ratio-policy.ts", import.meta.url), "utf8");
    const policyCompiled = ts.transpileModule(policySource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: "photo-ratio-policy.ts",
    }).outputText;
    await fs.writeFile(path.join(directory, "photo-ratio-policy.mjs"), policyCompiled, "utf8");
    compiled = compiled
      .replaceAll('from "./photo-ratio-policy"', 'from "./photo-ratio-policy.mjs"')
      .replaceAll('from "../../photo-ratio-policy"', 'from "./photo-ratio-policy.mjs"');
  }
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

function asset(id, aspectRatio, orientation) {
  const width = Math.round(aspectRatio * 1000);
  const variant = (name, scale) => ({
    src: `/photos/library/${id}-${name}.webp`,
    width: Math.round(width * scale),
    height: Math.round(1000 * scale),
    bytes: 1000,
  });
  return {
    id,
    aspectRatio,
    orientation,
    variants: {
      thumbnail: variant("thumbnail", .3),
      card: variant("card", .7),
      full: variant("full", 1),
    },
  };
}

test("template catalog slot counts stay aligned with their ratio contracts", async (t) => {
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");
  assert.equal(templateCatalog.length, 11);
  for (const template of templateCatalog) {
    assert.equal(template.photoSlots, template.slotRatios.length, template.id);
  }
});

test("16:9 remains a display crop while primary landscape assignment targets 3:2", async (t) => {
  const { autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const primary = asset("primary", 1.5, "landscape");
  const cinematicWide = asset("cinematic-wide", 16 / 9, "landscape");

  const works = autoComposeTemplateWorks(
    [cinematicWide, primary],
    ["16:9"],
  );
  assert.equal(works[0].assetId, primary.id);
});

test("source-orientation adaptive composition fills all nine stable slots for every landscape/portrait mix", async (t) => {
  const { autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const characterRatios = ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"];

  for (let portraitCount = 0; portraitCount <= 9; portraitCount += 1) {
    const assets = Array.from({ length: 9 }, (_, index) => index < portraitCount
      ? asset(`portrait-${portraitCount}-${index}`, 2 / 3, "portrait")
      : asset(`landscape-${portraitCount}-${index}`, 3 / 2, "landscape"));
    const works = autoComposeTemplateWorks(
      assets,
      characterRatios,
      [],
      { adaptiveToSourceOrientation: true },
    );

    assert.equal(works.length, 9, `${portraitCount} portrait assets`);
    assert.deepEqual(works.map(({ slotIndex }) => slotIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(works.map(({ assetId }) => assetId), assets.map(({ id }) => id));
  }
});

test("source-orientation adaptive composition preserves valid locked slot identities", async (t) => {
  const { assetToWork, autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const characterRatios = ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"];
  const assets = [
    asset("landscape", 3 / 2, "landscape"),
    asset("portrait", 2 / 3, "portrait"),
  ];
  const lockedPortrait = {
    ...assetToWork(assets[1], 7),
    locked: true,
  };

  const works = autoComposeTemplateWorks(
    assets,
    characterRatios,
    [lockedPortrait],
    { adaptiveToSourceOrientation: true },
  );
  const bySlot = new Map(works.map((work) => [work.slotIndex, work]));
  assert.equal(bySlot.get(7)?.assetId, "portrait");
  assert.equal(bySlot.get(7)?.locked, true);
  assert.equal(bySlot.get(0)?.assetId, "landscape");
});

test("character presentation keeps every nine-photo orientation permutation in three justified rows", async (t) => {
  const {
    buildSourceOrientationSlots,
    groupSourceOrientationSlots,
    justifiedPhotoColumns,
  } = await importTypeScriptModule(t, "app/templates/shared/source-orientation-layout.ts");
  const fallback = ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"];
  const work = (index, portrait) => ({
    code: `WORK-${index}`,
    previewWidth: portrait ? 800 : 1200,
    previewHeight: portrait ? 1200 : 800,
  });

  for (let orientationMask = 0; orientationMask < 2 ** 9; orientationMask += 1) {
    const works = Array.from(
      { length: 9 },
      (_, index) => work(index, (orientationMask & (1 << index)) !== 0),
    );
    const slots = buildSourceOrientationSlots(works, fallback);
    const rows = groupSourceOrientationSlots(slots);
    const portraitCount = works.filter((item) => item.previewHeight > item.previewWidth).length;

    assert.equal(slots.length, 9);
    assert.deepEqual(slots.map(({ index }) => index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(slots.map(({ work: item }) => item?.code), works.map(({ code }) => code));
    assert.equal(slots.filter(({ ratio }) => ratio === "2:3").length, portraitCount);
    assert.ok(slots.every(({ ratio }) => ratio === "3:2" || ratio === "2:3"));
    assert.deepEqual(rows.map(({ length }) => length), [3, 3, 3]);
    assert.deepEqual(rows.flat().map(({ index }) => index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const row of rows) {
      const fractions = justifiedPhotoColumns(row).split(" ").map((value) => Number.parseFloat(value));
      assert.deepEqual(
        fractions.map((fraction, index) => Math.round((fraction / (row[index].ratio === "2:3" ? 2 / 3 : 3 / 2)) * 1_000)),
        [1_000, 1_000, 1_000],
      );
    }
  }
});

test("character presentation preserves placeholders and square source identity without a 1:1 target", async (t) => {
  const { buildSourceOrientationSlots } = await importTypeScriptModule(t, "app/templates/shared/source-orientation-layout.ts");
  const fallback = ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"];

  for (let workCount = 0; workCount <= 9; workCount += 1) {
    const works = Array.from({ length: workCount }, (_, index) => ({
      previewWidth: index === 0 ? 1000 : 1500,
      previewHeight: 1000,
    }));
    const slots = buildSourceOrientationSlots(works, fallback);
    assert.equal(slots.filter(({ work }) => work).length, workCount);
    assert.equal(slots.filter(({ work }) => !work).length, 9 - workCount);
    assert.ok(slots.every(({ ratio }) => ratio === "3:2" || ratio === "2:3"));
    if (workCount > 0) {
      assert.equal(slots[0].sourceOrientation, "square");
      assert.equal(slots[0].ratio, "3:2", "square identity is retained while its presentation target is not square");
    }
  }
});

test("character template keeps keyboard, lightbox, placeholder, and responsive justified-row interactions", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/character-select/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/character-select/template.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(template, /adaptiveToSourceOrientation: true/);
  assert.match(template, /groupSourceOrientationSlots/);
  assert.match(template, /data-character-row/);
  assert.match(template, /data-source-orientation/);
  assert.match(template, /event\.key === "ArrowLeft"/);
  assert.match(template, /event\.key === "ArrowRight"/);
  assert.match(template, /aria-pressed=/);
  assert.ok((template.match(/onOpenWork\(/g) ?? []).length >= 2, "fighter and archive must keep lightbox entry points");
  assert.ok((template.match(/<PhotoPlaceholder/g) ?? []).length >= 3);
  assert.match(template, /PhotoPlaceholder slot=\{slot\} compact label="ARCHIVE SLOT PENDING"/);
  assert.match(css, /grid-template-columns:var\(--character-columns\)/);
  assert.match(css, /@media \(max-width:650px\)/);
  assert.doesNotMatch(css, /aspect-ratio:\s*1(?:;|\})/);
});

test("auto composition preserves valid locks, drops orphan locks, and leaves incompatible slots empty", async (t) => {
  const { assetToWork, autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const landscape = asset("landscape", 1.5, "landscape");
  const secondLandscape = asset("landscape-two", 1.7, "landscape");
  const locked = { ...assetToWork(landscape, 1), locked: true, title: "KEEP THIS EDIT" };
  const orphan = { ...assetToWork(asset("missing", .67, "portrait"), 2), locked: true };
  const incompatibleLock = { ...assetToWork(secondLandscape, 2), locked: true };

  const works = autoComposeTemplateWorks(
    [landscape, secondLandscape],
    ["3:2", "16:9", "2:3"],
    [locked, orphan, incompatibleLock],
  );
  const bySlot = new Map(works.map((work) => [work.slotIndex, work]));

  assert.equal(bySlot.get(1)?.assetId, landscape.id);
  assert.equal(bySlot.get(1)?.title, "KEEP THIS EDIT");
  assert.equal(bySlot.get(1)?.locked, true);
  assert.equal(bySlot.get(0)?.assetId, secondLandscape.id);
  assert.equal(bySlot.get(0)?.locked, false, "an incompatible lock must be released before rematching");
  assert.equal(bySlot.has(2), false, "portrait slot should remain a placeholder");
  assert.equal(works.some((work) => work.assetId === "missing"), false);
});

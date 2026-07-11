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
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path.basename(sourceRelativePath),
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-layout-test-"));
  const modulePath = path.join(directory, `${path.basename(sourceRelativePath, path.extname(sourceRelativePath))}.mjs`);
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

test("auto composition finds the global minimum crop cost instead of taking the cheapest first edge", async (t) => {
  const { autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const closerToWide = asset("asset-a", 1.57, "landscape");
  const narrow = asset("asset-b", 1.20, "landscape");

  const works = autoComposeTemplateWorks(
    [closerToWide, narrow],
    ["3:2", "16:9"],
  );
  const bySlot = new Map(works.map((work) => [work.slotIndex, work.assetId]));

  assert.equal(bySlot.get(0), narrow.id);
  assert.equal(bySlot.get(1), closerToWide.id);
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

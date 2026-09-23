import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function load(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "photo-composition-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const name of ["viewport-fit", "collection-layout", "collection-photo-composition"]) {
    const source = await fs.readFile(new URL(`../app/templates/polaroid-field/${name}.ts`, import.meta.url), "utf8");
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    await fs.writeFile(path.join(directory, `${name}.mjs`), js.replaceAll('"./viewport-fit"', '"./viewport-fit.mjs"').replaceAll('"./collection-layout"', '"./collection-layout.mjs"'));
  }
  return { ...await import(pathToFileURL(path.join(directory, "collection-photo-composition.mjs"))), ...await import(pathToFileURL(path.join(directory, "viewport-fit.mjs"))) };
}

test("compositions preserve IDs, order, ratios and rotated boundaries across counts and orientations", async (t) => {
  const { buildCollectionPhotoComposition: build, getRotatedBounds, fitRectsToViewport } = await load(t);
  for (const count of [0, 1, 5, 9, 10, 13, 40]) for (const ratios of [[1.5], [2 / 3], [1.5, 2 / 3, 1, 16 / 9], [0.001, 1000, NaN, 0, -1, Infinity]]) for (const viewportWidth of [1440, 390, 320]) {
    const cards = Array.from({ length: count }, (_, index) => ({ id: `asset-${index}`, aspectRatio: ratios[index % ratios.length] }));
    const options = { viewportWidth, focusId: cards[2]?.id };
    const result = build(cards, options);
    assert.deepEqual(result, build(cards, options));
    assert.deepEqual(result.placements.map((card) => card.id), cards.map((card) => card.id));
    const bounds = result.placements.map(getRotatedBounds);
    for (const [index, card] of result.placements.entries()) {
      assert.ok(Object.values(card).filter((value) => typeof value === "number").every(Number.isFinite));
      const ratio = cards[index].aspectRatio;
      assert.ok(Math.abs(card.photoWidth / card.photoHeight - (Number.isFinite(ratio) && ratio > 0 ? ratio : 1)) < 1e-8);
      const box = bounds[index];
      assert.ok(box.left >= 0 && box.top >= 0 && box.right <= result.canvasWidth && box.bottom <= result.canvasHeight);
      for (const other of bounds.slice(index + 1)) assert.ok(box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top, "rotated photo cards do not collide");
    }
    if (count && viewportWidth < 600) assert.ok(result.canvasWidth <= viewportWidth);
    const fit = fitRectsToViewport({ width: viewportWidth, height: 664 }, { width: result.canvasWidth, height: result.canvasHeight }, result.placements);
    if (!count) assert.equal(fit, null);
    else {
      assert.ok((fit.content.right - fit.content.left) * fit.view.scale <= viewportWidth - 64 + 1e-6);
      assert.ok((fit.content.bottom - fit.content.top) * fit.view.scale <= 600 + 1e-6);
    }
    if (count === 40 && viewportWidth === 1440) assert.ok(result.canvasWidth / result.canvasHeight > 0.45 && result.canvasWidth / result.canvasHeight < 2.1, "large collections expand in two dimensions");
  }
});

test("focus and secondary have actual area hierarchy, with non-row geometry and bounded inputs", async (t) => {
  const { buildCollectionPhotoComposition: build } = await load(t);
  const cards = Array.from({ length: 9 }, (_, index) => ({ id: `asset-${index}`, aspectRatio: index % 2 ? 2 / 3 : 1.5 }));
  const layout = build(cards, { focusId: "asset-4" });
  assert.ok(layout.canvasWidth / layout.canvasHeight >= 1.55 && layout.canvasWidth / layout.canvasHeight <= 2.05, `nine photos remain an editorial landscape: ${layout.canvasWidth}x${layout.canvasHeight}`);
  const area = (card) => card.photoWidth * card.photoHeight;
  assert.equal(layout.focusId, "asset-4");
  assert.ok(area(layout.placements[4]) > area(layout.placements[0]) * 1.4);
  assert.ok(area(layout.placements[0]) > area(layout.placements[1]) * 1.5);
  assert.ok(new Set(layout.placements.map((card) => Math.round(card.left))).size >= 7);
  assert.ok(new Set(layout.placements.map((card) => Math.round(card.top))).size >= 7);
  assert.equal(build(cards, { focusId: "absent" }).focusId, "asset-0");
  assert.throws(() => build([cards[0], cards[0]]), /unique/);
  assert.throws(() => build(Array.from({ length: 501 }, (_, index) => ({ id: String(index), aspectRatio: 1 }))), /500/);
  assert.equal(build(Array.from({ length: 500 }, (_, index) => ({ id: String(index), aspectRatio: 1 }))).placements.length, 500);
});

test("photo composition is explicit saved-workspace presentation, not a cover or persistence change", async () => {
  const read = (name) => fs.readFile(new URL(`../app/templates/polaroid-field/${name}`, import.meta.url), "utf8");
  const experience = await read("collection-experience.tsx");
  const scene = await read("collection-scene.tsx");
  assert.ok(experience.includes("composedPhotos={!!savedCollections && !!selected}"));
  assert.ok(scene.includes("composedPhotos = false"));
  assert.ok(scene.includes("composedPhotos && !isHome"));
  assert.ok(scene.includes("composed ? buildCollectionPhotoComposition : buildCollectionLayout"));
  assert.ok(scene.includes("item.id === placement.id"));
  assert.ok(scene.includes("ResizeObserver"));
  assert.ok(scene.includes("element.clientWidth"));
  assert.ok(scene.includes("!composed && <div className={field.canvasTitle}"));
  assert.ok(!scene.includes('method: "PUT"'));
  assert.ok(scene.includes("readableGroupSize: composed ? 7 : undefined"));
  const viewport = await read("use-constellation-viewport.ts");
  assert.ok(viewport.includes("readableGroupSize ? [...cards]"));
  assert.ok(viewport.includes("if (geometry.readableFit)"));
});

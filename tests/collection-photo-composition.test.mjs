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
  return { ...await import(pathToFileURL(path.join(directory, "collection-photo-composition.mjs"))), ...await import(pathToFileURL(path.join(directory, "collection-layout.mjs"))), ...await import(pathToFileURL(path.join(directory, "viewport-fit.mjs"))) };
}

test("compositions preserve IDs, order, ratios and rotated boundaries across counts and orientations", async (t) => {
  const { buildCollectionPhotoComposition: build, getPhotoCompositionBounds, fitRectsToViewport } = await load(t);
  for (const count of [0, 1, 2, 3, 9, 11, 12, 13, 40, 200]) for (const ratios of [[1.5], [2 / 3], [2, 0.5, 1, 16 / 9], [0.001, 1000, NaN, 0, -1, Infinity]]) for (const viewportWidth of [1440, 769, 768, 767, 390, 375, 320]) {
    const cards = Array.from({ length: count }, (_, index) => ({ id: `asset-${index}`, aspectRatio: ratios[index % ratios.length] }));
    const options = { viewportWidth, focusId: cards[2]?.id };
    const result = build(cards, options);
    assert.deepEqual(result, build(cards, options));
    assert.deepEqual(result.placements.map((card) => card.id), cards.map((card) => card.id));
    const bounds = result.placements.map(getPhotoCompositionBounds);
    for (const [index, card] of result.placements.entries()) {
      assert.ok(Object.values(card).filter((value) => typeof value === "number").every(Number.isFinite));
      const ratio = cards[index].aspectRatio;
      assert.ok(Math.abs(card.photoWidth / card.photoHeight - (Number.isFinite(ratio) && ratio > 0 ? ratio : 1)) < 1e-8);
      const box = bounds[index];
      assert.ok(box.left >= 0 && box.top >= 0 && box.right <= result.canvasWidth && box.bottom <= result.canvasHeight);
      for (const other of bounds.slice(index + 1)) assert.ok(box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top, "rotated photo cards do not collide");
    }
    if (count && viewportWidth < 768) assert.ok(result.canvasWidth <= viewportWidth);
    const fit = fitRectsToViewport({ width: viewportWidth, height: 664 }, { width: result.canvasWidth, height: result.canvasHeight }, result.placements);
    if (!count) assert.equal(fit, null);
    else {
      assert.ok((fit.content.right - fit.content.left) * fit.view.scale <= viewportWidth - 64 + 1e-6);
      assert.ok((fit.content.bottom - fit.content.top) * fit.view.scale <= 600 + 1e-6);
    }
    if (count === 40 && viewportWidth === 1440) assert.ok(result.canvasWidth / result.canvasHeight > 0.4 && result.canvasWidth / result.canvasHeight < 4, "large collections expand in two dimensions");
  }
});

test("sequential reading groups preserve focus identity without moving it before earlier photos", async (t) => {
  const { buildCollectionPhotoComposition: build, getPhotoCompositionBounds } = await load(t);
  const cards = Array.from({ length: 9 }, (_, index) => ({ id: `asset-${index}`, aspectRatio: index % 2 ? 2 / 3 : 1.5 }));
  for (const count of [1, 2, 9, 13, 40, 200]) for (const focusIndex of [0, Math.floor(count / 2), count - 1]) {
    const input = Array.from({ length: count }, (_, index) => ({ id: `photo-${index}`, aspectRatio: [1.5, 0.5, 1][index % 3] }));
    const layout = build(input, { focusId: input[focusIndex].id });
    assert.deepEqual(layout.readingGroups.flat(), input.map((card) => card.id));
    assert.deepEqual(layout.placements.map((card) => card.index), input.map((_, index) => index));
    let priorGroup;
    for (const ids of layout.readingGroups) {
      const boxes = ids.map((id) => getPhotoCompositionBounds(layout.placements.find((card) => card.id === id)));
      for (let index = 1; index < boxes.length; index++) assert.ok(boxes[index].left > boxes[index - 1].right);
      if (priorGroup && (count < 3 || count > 16)) assert.ok(boxes[0].left > priorGroup.right || boxes[0].top > priorGroup.bottom, "large groups keep their existing reading bands");
      priorGroup = { right: Math.max(...boxes.map((box) => box.right)), bottom: Math.max(...boxes.map((box) => box.bottom)) };
    }
  }
  const layout = build(cards, { focusId: "asset-4" });
  for (const count of [11, 13]) {
    const wide = build(Array.from({ length: count }, (_, index) => ({ id: String(index), aspectRatio: 2 / 3 })));
    assert.ok(wide.canvasWidth / wide.canvasHeight > 1.6, "portrait collections spread across a landscape canvas");
  }
  const area = (card) => card.photoWidth * card.photoHeight;
  assert.equal(layout.focusId, "asset-4");
  assert.ok(area(layout.placements[4]) > area(layout.placements[0]) * 1.4);
  assert.equal(layout.threads.length, cards.length - 1);
  assert.equal(new Set(layout.placements.map((card) => Math.round(card.top))).size, cards.length, "small collections do not share row baselines");
  assert.equal(build(cards, { focusId: "absent" }).focusId, "asset-0");
  assert.throws(() => build([cards[0], cards[0]]), /unique/);
  assert.throws(() => build(Array.from({ length: 501 }, (_, index) => ({ id: String(index), aspectRatio: 1 }))), /500/);
  assert.equal(build(Array.from({ length: 500 }, (_, index) => ({ id: String(index), aspectRatio: 1 }))).placements.length, 500);
});

test("single and two-card bounds contain only content; compact covers and tall photos use native vertical space", async (t) => {
  const { buildCollectionPhotoComposition: build, getPhotoCompositionBounds } = await load(t);
  for (const count of [1, 2]) {
    const layout = build(Array.from({ length: count }, (_, index) => ({ id: String(index), aspectRatio: count === 1 ? 0.5 : 2 })));
    const bounds = layout.placements.map(getPhotoCompositionBounds);
    assert.ok(layout.canvasWidth - Math.max(...bounds.map((box) => box.right)) <= 17);
    assert.ok(layout.canvasHeight - Math.max(...bounds.map((box) => box.bottom)) <= 17);
    assert.ok(Math.min(...bounds.map((box) => box.left)) <= 17);
    assert.ok(Math.min(...bounds.map((box) => box.top)) <= 35);
  }
  for (const viewportWidth of [320, 375, 390, 767]) for (const kind of ["photos", "covers"]) {
    const cards = [{ id: "first", aspectRatio: 0.5 }, { id: "last", aspectRatio: 0.05 }];
    const layout = build(cards, { viewportWidth, kind, focusId: "last" });
    assert.equal(layout.placements[0].id, "first");
    assert.ok(Math.abs(layout.placements[0].height - layout.placements[0].photoHeight - (kind === "covers" ? 108 : 68)) < 1e-8);
    assert.ok(layout.placements[1].photoHeight > viewportWidth, "tall photo remains large and scrollable");
    assert.ok(getPhotoCompositionBounds(layout.placements[1]).top > getPhotoCompositionBounds(layout.placements[0]).bottom);
    assert.ok(layout.placements[0].photoWidth > viewportWidth * 0.55, "ordinary portrait uses available space rather than the old fixed tiny edge");
  }
});

test("photo composition is explicit saved-workspace presentation, not a cover or persistence change", async () => {
  const read = (name) => fs.readFile(new URL(`../app/templates/polaroid-field/${name}`, import.meta.url), "utf8");
  const experience = await read("collection-experience.tsx");
  const scene = await read("collection-scene.tsx");
  assert.ok(experience.includes("composedPhotos={!!savedCollections && !!selected}"));
  assert.ok(scene.includes("composedPhotos = false"));
  assert.ok(scene.includes("composedPhotos && !isHome"));
  assert.ok(scene.includes("composed || (readOnly && compact) ? buildCollectionPhotoComposition : buildCollectionLayout"));
  assert.ok(scene.includes("width < (readOnly ? 768 : 600)"));
  assert.ok(scene.includes("enabled: !(readOnly && compact)"));
  assert.ok(scene.includes("decorationMargin: readOnly ? 24 : 0"));
  assert.ok(scene.includes("data-scene-shell"));
  const css = await read("scene.module.css");
  assert.match(css, /\.sceneShell \.canvas\s*\{\s*isolation:\s*isolate/,
    "natural mobile canvas must isolate large card z-index values beneath Lightbox");
  assert.ok(scene.includes("item.id === placement.id"));
  assert.ok(scene.includes("ResizeObserver"));
  assert.ok(scene.includes("element.clientWidth"));
  assert.ok(scene.includes('data-composition={composed ? "pasted" : undefined}'));
  assert.ok(scene.includes('<div className={field.canvasTitle} aria-hidden="true">'));
  assert.ok(!scene.includes('method: "PUT"'));
  assert.ok(scene.includes('initialMode: "overview"'));
  const viewport = await read("use-constellation-viewport.ts");
  assert.ok(viewport.includes("readableGroupSize ? [...cards]"));
  assert.ok(viewport.includes("if (geometry.readableFit)"));
});
